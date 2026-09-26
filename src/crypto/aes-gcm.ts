/**
 * AES-256-GCM envelope encryption.
 *
 * Every call to `encrypt` draws a fresh 96-bit IV from the CSPRNG. GCM fails
 * catastrophically if a (key, nonce) pair is ever reused, so the IV is never
 * derived, cached or persisted alongside its ciphertext — it is stored with
 * the blob and regenerated on every write.
 */

import { CRYPTO } from '../core/constants';
import { bytesToUtf8, fromBase64, randomBytes, toBase64, utf8ToBytes } from '../core/utils/encoding';

/** JSON-serialisable ciphertext envelope, safe to hand to `chrome.storage`. */
export interface EncryptedBlob {
  /** Envelope version, so the format can evolve without a data migration. */
  v: number;
  /** Base64 96-bit nonce. */
  iv: string;
  /** Base64 ciphertext with the 128-bit GCM tag appended. */
  ct: string;
}

export function generateRawKey(): Uint8Array {
  return randomBytes(CRYPTO.KEY_BITS / 8);
}

export async function importKey(raw: Uint8Array, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBufferView(raw), { name: CRYPTO.ALGORITHM }, extractable, [
    'encrypt',
    'decrypt',
  ]);
}

export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<EncryptedBlob> {
  const iv = randomBytes(CRYPTO.IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: CRYPTO.ALGORITHM, iv, tagLength: CRYPTO.TAG_BITS },
    key,
    utf8ToBytes(plaintext),
  );

  return {
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Throws `OperationError` when the key is wrong or the blob was tampered with. */
export async function decrypt(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  if (blob.v !== 1) throw new Error(`Unsupported envelope version: ${blob.v}`);

  const plaintext = await crypto.subtle.decrypt(
    { name: CRYPTO.ALGORITHM, iv: fromBase64(blob.iv), tagLength: CRYPTO.TAG_BITS },
    key,
    fromBase64(blob.ct),
  );

  return bytesToUtf8(new Uint8Array(plaintext));
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedBlob> {
  return encrypt(key, JSON.stringify(value));
}

export async function decryptJson<T>(key: CryptoKey, blob: EncryptedBlob): Promise<T> {
  return JSON.parse(await decrypt(key, blob)) as T;
}

/**
 * `crypto.subtle` rejects views whose backing buffer might be shared memory.
 * Copying is cheap at our sizes and makes the call site total.
 */
function toArrayBufferView(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
