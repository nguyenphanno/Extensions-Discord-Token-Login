/**
 * Domain model shared by every layer of the extension.
 *
 * Nothing in here depends on Chrome APIs, so these types stay usable from the
 * popup, the options page, the service worker and any future test harness.
 */

/** Raw `/api/v9/users/@me` payload from Discord. Only the fields we use. */
export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  discriminator: string;
  avatar: string | null;
  avatar_decoration: string | null;
  banner: string | null;
  accent_color: number | null;
  bot: boolean;
  public_flags: number;
  verified: boolean;
  mfa_enabled: boolean;
}

/**
 * Health of a stored token, as determined by the last validation run.
 * `unknown` is the state of every freshly imported account.
 */
export type AccountStatus = 'unknown' | 'valid' | 'expired' | 'locked' | 'error';

/** A single Discord identity the user has saved. Tokens are never plaintext. */
export interface Account {
  /** Discord snowflake — stable, unique, and the natural primary key. */
  id: string;
  /** `username#1234` or the legacy bare `username`. */
  tag: string;
  /** Human-facing display name (global name, falling back to username). */
  displayName: string;
  avatarUrl: string | null;
  /** Accent colour used for the generated avatar fallback, e.g. `#5865f2`. */
  accentColor: string;
  status: AccountStatus;
  /** Free-text note the user can attach to an account. */
  note: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  lastValidatedAt: number | null;
}

/** Account plus the plaintext token, only ever held in memory. */
export interface AccountWithToken extends Account {
  token: string;
}

/** Shape written to the encrypted vault, before encryption. */
export interface AccountRecord {
  token: string;
  account: Account;
}

/** Non-sensitive, plaintext preferences. */
export interface Settings {
  /** Account id the user is currently signed in as. */
  activeAccountId: string | null;
  /** Auto-focus the token field when the popup opens. */
  focusTokenOnOpen: boolean;
  /** Clear the token field after a successful login. */
  clearTokenAfterLogin: boolean;
  /** Reveal the token field contents as plain text instead of masking. */
  revealToken: boolean;
  /** Open Discord in a new window rather than reusing a tab. */
  openInNewWindow: boolean;
  /** Show the account count on the toolbar badge. */
  showBadge: boolean;
}

export type LockState = 'unlocked' | 'locked' | 'unprotected';

/** Snapshot returned to the UI on every open. */
export interface AppState {
  accounts: Account[];
  activeAccountId: string | null;
  lock: LockState;
  settings: Settings;
}

/* -------------------------------------------------------------------------- */
/* Service worker message protocol                                             */
/* -------------------------------------------------------------------------- */

export type Request =
  | { type: 'state/get' }
  | { type: 'account/add'; token: string; note?: string }
  | { type: 'account/remove'; id: string }
  | { type: 'account/update'; id: string; patch: Partial<Pick<Account, 'note' | 'displayName'>> }
  | { type: 'account/validate'; id: string }
  | { type: 'account/validateAll' }
  | { type: 'account/activate'; id: string }
  | { type: 'account/login'; id: string }
  | { type: 'account/logout' }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'vault/lock' }
  | { type: 'vault/unlock'; passphrase: string }
  | { type: 'vault/setPassphrase'; passphrase: string }
  | { type: 'vault/removePassphrase' }
  | { type: 'vault/destroy' }
  | { type: 'token/extract' }
  | { type: 'token/login'; token: string }
  | { type: 'token/validate'; token: string };

export type Failure = { ok: false; error: string; code?: string };
export type Success<T> = { ok: true; data: T };

/** Every handler resolves to this envelope so the UI never sees raw throws. */
export type Result<T> = Success<T> | Failure;

/** Outcome of a dry-run token check, returned by `token/validate`. */
export interface TokenProbe {
  valid: boolean;
  message: string;
  displayName: string | null;
  tag: string | null;
}

export type Response =
  | Result<AppState>
  | Result<Account>
  | Result<Account[]>
  | Result<Settings>
  | Result<LockState>
  | Result<TokenProbe>
  | Result<string>
  | Result<number>
  | Result<null>;

/* -------------------------------------------------------------------------- */
/* Progress reporting for long-running background jobs                        */
/* -------------------------------------------------------------------------- */

export interface Progress {
  id: string;
  phase: string;
  detail?: string;
  /** 0..1, or `null` for indeterminate work. */
  ratio: number | null;
}

export type ProgressEvent = { type: 'progress'; progress: Progress } | Response;
