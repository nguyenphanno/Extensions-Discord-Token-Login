/**
 * Key derivation.
 *
 * Two modes, chosen by the user in settings:
 *
 *  1. **Passphrase protected** — PBKDF2-HMAC-SHA256 with a random 128-bit salt
 *     and 310 000 iterations. The key is non-extractable, so even a process
 *     that can call `decrypt` cannot lift the raw key out.
 *  2. **Device protected** — a random 256-bit key generated once. It is stored
 *     in `chrome.storage.local`, which raises the bar against casual inspection
 *     and sync/backup leakage but is *not* a defence against a determined local
 *     attacker. The UI states this honestly rather than implying more.
 */

import { CRYPTO } from '../core/constants';
import { randomBytes } from '../core/utils/encoding';
import { generateRawKey, importKey } from './aes-gcm';

export interface KdfParams {
  salt: Uint8Array;
  iterations: number;
  hash: string;
}

export function createKdfParams(): KdfParams {
  return {
    salt: randomBytes(CRYPTO.SALT_BYTES),
    iterations: CRYPTO.PBKDF2_ITERATIONS,
    hash: CRYPTO.PBKDF2_HASH,
  };
}

/**
 * Derived keys are produced as *extractable* purely so `Vault` can stash the
 * raw bytes in `chrome.storage.session` — memory-backed, never written to disk,
 * never exposed to content scripts, and wiped on browser restart. The key that
 * the vault actually holds long-term is re-imported as non-extractable by
 * `Vault#materialise`, so a long-lived in-memory handle cannot be lifted.
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  params: KdfParams,
): Promise<CryptoKey> {
  return derive(passphrase, params, true);
}

export async function deriveSessionKey(passphrase: string, params: KdfParams): Promise<CryptoKey> {
  return derive(passphrase, params, false);
}

async function derive(
  passphrase: string,
  params: KdfParams,
  extractable: boolean,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: params.salt, iterations: params.iterations, hash: params.hash },
    material,
    { name: CRYPTO.ALGORITHM, length: CRYPTO.KEY_BITS },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export async function createDeviceKey(): Promise<CryptoKey> {
  return importKey(generateRawKey(), true);
}

/** Rough cost of one unlock, used by the settings page to set expectations. */
export async function benchmarkUnlock(params: KdfParams): Promise<number> {
  const started = performance.now();
  await deriveKeyFromPassphrase('benchmark-probe', params);
  return performance.now() - started;
}
