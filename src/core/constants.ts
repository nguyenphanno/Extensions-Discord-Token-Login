/** Single source of truth for every magic value in the project. */

export const DISCORD = {
  /** Origin the extension is allowed to touch. */
  ORIGIN: 'https://discord.com',
  APP_URL: 'https://discord.com/app',
  API_BASE: 'https://discord.com/api/v9',
  /** Probes the tab for a live session; must match `host_permissions`. */
  MATCH_PATTERN: 'https://discord.com/*',
  /** localStorage key Discord keeps the session token in. */
  TOKEN_STORAGE_KEY: 'token',
  /** localStorage key holding the token discriminator ("0", "0.1.0", …). */
  TOKEN_VERSION_KEY: 'token_discriminator',
  API_VERSION: 9,
} as const;

export const STORAGE = {
  /** AES-256-GCM payload wrapped around a single record. */
  RECORD_PREFIX: 'dtl:rec:',
  /** Non-sensitive settings blob. */
  SETTINGS: 'dtl:settings',
  /** Salt + KDF parameters + passphrase verifier. */
  VAULT_META: 'dtl:vault:meta',
  /** Active unlocks, held in memory only, never on disk. */
  SESSION_KEY: 'dtl:vault:key',
  SCHEMA_VERSION: 1,
} as const;

export const CRYPTO = {
  ALGORITHM: 'AES-GCM',
  KEY_BITS: 256,
  /** GCM recommends a 96-bit nonce; never reuse with a given key. */
  IV_BYTES: 12,
  SALT_BYTES: 16,
  TAG_BITS: 128,
  /**
   * OWASP 2023 guidance for PBKDF2-HMAC-SHA256. Chosen so unlocking stays
   * imperceptible on a laptop (~200 ms) while remaining costly to brute force.
   */
  PBKDF2_ITERATIONS: 310_000,
  PBKDF2_HASH: 'SHA-256',
  /** Plaintext used to prove a candidate passphrase opens the vault. */
  VERIFIER_TEXT: 'dtl/v1/open-sesame',
} as const;

export const NETWORK = {
  /** Discord occasionally stalls; retry well inside any user-facing timeout. */
  REQUEST_TIMEOUT_MS: 12_000,
  MAX_ATTEMPTS: 3,
  BACKOFF_BASE_MS: 600,
  BACKOFF_MAX_MS: 4_000,
  /** Space out `validateAll` so we never look like an account farm. */
  VALIDATION_JITTER_MS: 450,
  /**
   * How many captured values may be checked against Discord during one capture.
   * A page can hold several token-shaped strings that are not session tokens, so
   * the first is not always the right one; this bounds how many we will spend
   * requests on before giving up and explaining.
   */
  CAPTURE_CANDIDATE_LIMIT: 4,
} as const;

export const TIMING = {
  /** Poll interval while waiting for a Discord tab to finish loading. */
  TAB_POLL_MS: 250,
  TAB_READY_TIMEOUT_MS: 20_000,
  /**
   * How long to let a reload take effect before judging the new document.
   * Polling alone cannot tell a stale document that still reports `complete`
   * from a freshly committed one, so the first poll waits out this window.
   */
  RELOAD_SETTLE_MS: 700,
  /** Popup keeps its state alive this long after the last write. */
  WORKER_IDLE_MS: 45_000,
  TOAST_MS: 4_200,
} as const;

export const CONTEXT_MENU = {
  ROOT: 'dtl-root',
  QUICK_LOGIN: 'dtl-quick-login',
  EXTRACT: 'dtl-extract',
  ACCOUNTS: 'dtl-accounts',
  SETTINGS: 'dtl-settings',
  SEPARATOR: 'dtl-separator',
} as const;

export const DISCORD_API_CDN = 'https://cdn.discordapp.com';

/**
 * Discord's 2023 rebrand palette. Sampled from the live web client so the
 * extension reads as part of the product rather than a bolt-on.
 */
export const PALETTE = {
  blurple: '#5865f2',
  blurpleHover: '#4752c4',
  blurpleActive: '#3c45a5',
  green: '#23a55a',
  greenHover: '#1a6334',
  red: '#f23f43',
  redHover: '#c93b3f',
  yellow: '#f0b232',
  link: '#00a8fc',
} as const;
