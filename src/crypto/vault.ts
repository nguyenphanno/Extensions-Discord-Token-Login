/**
 * The encrypted vault.
 *
 * Responsibilities:
 *  - own the active `CryptoKey` and the lock state machine
 *  - encrypt/decrypt individual records in `chrome.storage.local`
 *  - re-key every record atomically when the protection mode changes
 *
 * Threat model, stated plainly:
 *  - At rest, tokens are AES-256-GCM ciphertext. In device mode the key is
 *    stored beside it; only passphrase mode separates the key from the profile.
 *  - In `passphrase` mode the key never touches persistent storage.
 *  - In `device` mode the key *is* in `chrome.storage.local` next to the
 *    ciphertext. It does not protect against a copied profile or code with
 *    access to extension storage. The settings page explains this limit.
 */

import { CRYPTO, STORAGE } from '../core/constants';
import { createLogger } from '../core/logger';
import type { LockState } from '../core/types';
import { fromBase64, toBase64 } from '../core/utils/encoding';
import {
  decryptJson,
  encryptJson,
  exportKey,
  generateRawKey,
  importKey,
  type EncryptedBlob,
} from './aes-gcm';
import { createKdfParams, deriveKeyFromPassphrase, type KdfParams } from './key-derivation';

const log = createLogger('vault');

export type ProtectionMode = 'device' | 'passphrase';

interface KdfMeta {
  salt: string;
  iterations: number;
  hash: string;
}

export interface VaultMeta {
  version: number;
  mode: ProtectionMode;
  /** Present only in `passphrase` mode. */
  kdf: KdfMeta | null;
  /** Encrypts a known constant; a successful decrypt proves the passphrase. */
  verifier: EncryptedBlob | null;
  /** Base64 key, present only in `device` mode. */
  deviceKey: string | null;
  createdAt: number;
}

export class VaultLockedError extends Error {
  constructor() {
    super('The vault is locked. Unlock it to continue.');
    this.name = 'VaultLockedError';
  }
}

export class VaultAuthError extends Error {
  constructor() {
    super('That passphrase is not correct.');
    this.name = 'VaultAuthError';
  }
}

const META_DEFAULT: VaultMeta = {
  version: STORAGE.SCHEMA_VERSION,
  mode: 'device',
  kdf: null,
  verifier: null,
  deviceKey: null,
  createdAt: 0,
};

export class Vault {
  #key: CryptoKey | null = null;
  #meta: VaultMeta | null = null;
  #ready: Promise<VaultMeta> | null = null;
  /** Serialises mutations so two messages can never interleave a re-key. */
  #queue: Promise<unknown> = Promise.resolve();
  /** A fresh profile can receive several first requests before its key exists. */
  #deviceInitialisation: Promise<void> | null = null;

  /* ---------------------------------------------------------------- state */

  async meta(): Promise<VaultMeta> {
    if (this.#meta !== null) return this.#meta;

    if (this.#ready === null) {
      this.#ready = (async () => {
        const stored = await chrome.storage.local.get(STORAGE.VAULT_META);
        const raw = stored[STORAGE.VAULT_META] as Partial<VaultMeta> | undefined;
        const meta: VaultMeta = {
          ...META_DEFAULT,
          ...raw,
          version: raw?.version ?? STORAGE.SCHEMA_VERSION,
          mode: raw?.mode === 'passphrase' ? 'passphrase' : 'device',
        };
        this.#meta = meta;

        if (meta.createdAt === 0) await this.#persistMeta(meta);
        return meta;
      })();
    }

    return this.#ready;
  }

  async state(): Promise<LockState> {
    const meta = await this.meta();
    if (meta.mode === 'device') return 'unprotected';
    return this.#key === null ? 'locked' : 'unlocked';
  }

  isOpen(): boolean {
    return this.#key !== null;
  }

  async requireKey(): Promise<CryptoKey> {
    if (this.#key !== null) return this.#key;
    // Device-mode vaults unlock themselves; only passphrase mode can be locked.
    if ((await this.meta()).mode === 'device') await this.openDevice();
    if (this.#key === null) throw new VaultLockedError();
    return this.#key;
  }
  /* ------------------------------------------------------------ lifecycle */

  /**
   * Device mode: the key is on disk, so this is a no-crypto import.
   *
   * On a fresh install there is no key yet — one is generated and persisted
   * here, which is why the metadata is re-read afterwards. Holding on to the
   * pre-initialisation snapshot would leave `deviceKey` null forever and make
   * the very first write fail.
   */
  async openDevice(): Promise<void> {
    let meta = await this.meta();
    if (meta.mode === 'passphrase') return;

    if (meta.deviceKey === null) {
      if (this.#deviceInitialisation === null) {
        this.#deviceInitialisation = this.#initialiseDeviceMode().finally(() => {
          this.#deviceInitialisation = null;
        });
      }
      await this.#deviceInitialisation;
      meta = await this.meta();
    }

    if (meta.deviceKey === null) throw new Error('Vault has no device key');
    this.#key = await importKey(fromBase64(meta.deviceKey), false);
  }

  async unlock(passphrase: string): Promise<void> {
    const meta = await this.meta();
    if (meta.mode !== 'passphrase' || meta.kdf === null || meta.verifier === null) {
      throw new Error('Vault is not passphrase protected');
    }

    const params: KdfParams = {
      salt: fromBase64(meta.kdf.salt),
      iterations: meta.kdf.iterations,
      hash: meta.kdf.hash,
    };

    const candidate = await deriveKeyFromPassphrase(passphrase, params);
    try {
      const proof = await decryptJson<string>(candidate, meta.verifier);
      if (proof !== CRYPTO.VERIFIER_TEXT) throw new VaultAuthError();
    } catch {
      // A GCM tag mismatch and an explicit mismatch read identically from the
      // outside, so either way the answer is simply "wrong passphrase".
      throw new VaultAuthError();
    }

    // Re-import as non-extractable for the long-lived in-memory handle.
    const raw = await exportKey(candidate);
    this.#key = await importKey(raw, false);
    await this.#cacheSessionKey(raw);
    log.info('Vault unlocked');
  }

  lock(): void {
    this.#key = null;
    void chrome.storage.session.remove(STORAGE.SESSION_KEY);
  }

  /**
   * Called on worker start. Restores an unlock that happened earlier in this
   * browser session, so a service worker restart does not re-prompt the user.
   */
  async restoreSession(): Promise<LockState> {
    const meta = await this.meta();
    if (meta.mode === 'device') {
      await this.openDevice();
      return this.state();
    }

    if (this.#key !== null) return 'unlocked';

    const cached = await chrome.storage.session.get(STORAGE.SESSION_KEY);
    const raw = cached[STORAGE.SESSION_KEY];
    if (typeof raw !== 'string' || raw.length === 0) return 'locked';

    this.#key = await importKey(fromBase64(raw), false);
    return 'unlocked';
  }

  /* ---------------------------------------------------------- re-key paths */

  async setPassphrase(passphrase: string): Promise<void> {
    return this.#serialised(async () => {
      const current = await this.requireKey();
      const params = createKdfParams();
      const next = await deriveKeyFromPassphrase(passphrase, params);
      const verifier = await encryptJson(next, CRYPTO.VERIFIER_TEXT);

      const meta: VaultMeta = {
        version: STORAGE.SCHEMA_VERSION,
        mode: 'passphrase',
        kdf: { salt: toBase64(params.salt), iterations: params.iterations, hash: params.hash },
        verifier,
        deviceKey: null,
        createdAt: (await this.meta()).createdAt,
      };

      await this.#rekey(current, next, meta);
      const raw = await exportKey(next);
      this.#key = await importKey(raw, false);
      await this.#cacheSessionKey(raw);
      log.info('Vault switched to passphrase protection');
    });
  }

  async removePassphrase(): Promise<void> {
    return this.#serialised(async () => {
      const current = await this.requireKey();
      const raw = generateRawKey();
      const next = await importKey(raw, false);

      const meta: VaultMeta = {
        version: STORAGE.SCHEMA_VERSION,
        mode: 'device',
        kdf: null,
        verifier: null,
        deviceKey: toBase64(raw),
        createdAt: (await this.meta()).createdAt,
      };

      await this.#rekey(current, next, meta);
      this.#key = next;
      await chrome.storage.session.remove(STORAGE.SESSION_KEY);
      log.info('Vault switched to device protection');
    });
  }
  /* -------------------------------------------------------------- records */

  async read<T>(id: string): Promise<T | null> {
    return this.#serialised(async () => {
      const key = await this.requireKey();
      const storageKey = STORAGE.RECORD_PREFIX + id;
      const stored = await chrome.storage.local.get(storageKey);
      const blob = stored[storageKey] as EncryptedBlob | undefined;
      if (blob === undefined) return null;

      try {
        return await decryptJson<T>(key, blob);
      } catch (error) {
        log.error(`Record ${id} failed to decrypt — treating as unreadable`, error);
        return null;
      }
    });
  }

  async write<T>(id: string, value: T): Promise<void> {
    return this.#serialised(async () => {
      const key = await this.requireKey();
      const blob = await encryptJson(key, value);
      await chrome.storage.local.set({ [STORAGE.RECORD_PREFIX + id]: blob });
    });
  }

  async remove(id: string): Promise<void> {
    return this.#serialised(async () => {
      await this.requireKey();
      await chrome.storage.local.remove(STORAGE.RECORD_PREFIX + id);
    });
  }

  /** Record ids in stable (alphabetical) order so the UI never reshuffles. */
  async listIds(): Promise<string[]> {
    return this.#serialised(() => this.#listIds());
  }

  /** Wipes every encrypted record and the key material. Irreversible. */
  async destroy(): Promise<void> {
    return this.#serialised(async () => {
      const all = await chrome.storage.local.get(null);
      const doomed = Object.keys(all).filter((key) => key.startsWith(STORAGE.RECORD_PREFIX));
      if (doomed.length > 0) await chrome.storage.local.remove(doomed);

      this.#key = null;
      this.#meta = null;
      this.#ready = null;
      await chrome.storage.session.remove(STORAGE.SESSION_KEY);
      await chrome.storage.local.remove([STORAGE.VAULT_META, STORAGE.SETTINGS]);
      await this.#initialiseDeviceMode();
    });
  }

  /* ---------------------------------------------------------------- inner */

  async #serialised<T>(work: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(work, work);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #initialiseDeviceMode(): Promise<void> {
    const raw = generateRawKey();
    const meta: VaultMeta = {
      version: STORAGE.SCHEMA_VERSION,
      mode: 'device',
      kdf: null,
      verifier: null,
      deviceKey: toBase64(raw),
      createdAt: Date.now(),
    };

    await this.#persistMeta(meta);
    this.#key = await importKey(raw, false);
  }

  /**
   * Re-encrypts every record under a new key. If any single write fails the
   * previous ciphertexts — which are still in memory — are written back, so a
   * partial re-key can never destroy data.
   */
  async #rekey(current: CryptoKey, next: CryptoKey, meta: VaultMeta): Promise<void> {
    const previousMeta = { ...(await this.meta()) };
    const ids = await this.#listIds();
    const originals = new Map<string, unknown>();
    const migrated = new Map<string, EncryptedBlob>();

    for (const id of ids) {
      const storageKey = STORAGE.RECORD_PREFIX + id;
      const stored = await chrome.storage.local.get(storageKey);
      const blob = stored[storageKey] as EncryptedBlob | undefined;
      if (blob === undefined) continue;
      originals.set(storageKey, blob);
      migrated.set(storageKey, await encryptJson(next, await decryptJson<unknown>(current, blob)));
    }

    try {
      await chrome.storage.local.set(Object.fromEntries(migrated));
      await this.#persistMeta(meta);
    } catch (error) {
      log.error('Re-key failed, rolling back to previous ciphertexts', error);
      try {
        if (originals.size > 0) await chrome.storage.local.set(Object.fromEntries(originals));
        await chrome.storage.local.set({ [STORAGE.VAULT_META]: previousMeta });
        this.#meta = previousMeta;
      } catch (rollbackError) {
        log.error('Vault re-key rollback could not be completed', rollbackError);
        throw new Error(
          'Vault re-key failed and its rollback could not be confirmed. Do not close the browser; reopen the extension and check the vault.',
          { cause: rollbackError },
        );
      }
      throw error;
    }
  }

  async #persistMeta(meta: VaultMeta): Promise<void> {
    await chrome.storage.local.set({ [STORAGE.VAULT_META]: meta });
    this.#meta = meta;
  }

  async #cacheSessionKey(raw: Uint8Array): Promise<void> {
    await chrome.storage.session.set({ [STORAGE.SESSION_KEY]: toBase64(raw) });
  }

  async #listIds(): Promise<string[]> {
    await this.requireKey();
    const all = await chrome.storage.local.get(null);
    return Object.keys(all)
      .filter((key) => key.startsWith(STORAGE.RECORD_PREFIX))
      .map((key) => key.slice(STORAGE.RECORD_PREFIX.length))
      .sort();
  }
}

/** Single vault instance shared by the whole service worker. */
export const vault = new Vault();
