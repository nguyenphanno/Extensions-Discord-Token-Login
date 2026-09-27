/**
 * The only module that talks to Discord.
 *
 * Every request is authenticated with a token held for the duration of a single
 * `await` and never stored, logged, or attached to a longer-lived object.
 */

import { DISCORD, NETWORK } from '../core/constants';
import { createLogger } from '../core/logger';
import type { AccountStatus, DiscordUser } from '../core/types';
import { retry, withTimeout } from '../core/utils/async';

const log = createLogger('api');

/** Thrown for any Discord rejection, carrying the HTTP status for the UI. */
export class DiscordApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'DiscordApiError';
  }
}

export interface TokenCheck {
  valid: boolean;
  user: DiscordUser | null;
  status: AccountStatus;
  message: string;
}

/**
 * Cheap structural screen applied before any network call. Discord tokens are
 * base64url segments joined by dots; this deliberately stays loose so it does
 * not reject a future format change, while still catching pasted prose.
 */
export function looksLikeToken(candidate: string): boolean {
  const value = candidate.trim();
  if (value.length < 50 || value.length > 300) return false;
  if (/\s/.test(value)) return false;
  return /^[A-Za-z0-9._~+/=-]+$/.test(value);
}

function endpoint(path: string): string {
  return `${DISCORD.API_BASE}${path}`;
}

async function request<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  return retry(
    async () => {
      const response = await withTimeout(
        fetch(endpoint(path), {
          method: 'GET',
          headers: {
            // A user token is sent with no scheme at all. Discord recognises
            // `Bot ` for bots and `Bearer ` for OAuth2 grants; anything else,
            // including the `Token ` prefix other APIs use, is read as part of
            // the credential, so every otherwise-valid token came back 401.
            Authorization: token.trim(),
            Accept: 'application/json',
            // `User-Agent` is browser-controlled, so setting it here had no
            // effect, and `X-Super-Properties` is optional — the empty value
            // that used to ride along was worse than sending nothing at all.
          },
          ...(signal ? { signal } : {}),
        }),
        NETWORK.REQUEST_TIMEOUT_MS,
        `GET ${path}`,
      ).catch((error: unknown) => {
        // An abort is a caller decision, never something to retry.
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw error;
      });

      if (!response.ok) throw await toApiError(response);

      return (await response.json()) as T;
    },
    {
      attempts: NETWORK.MAX_ATTEMPTS,
      base: NETWORK.BACKOFF_BASE_MS,
      cap: NETWORK.BACKOFF_MAX_MS,
      shouldRetry: (error) => {
        // Retry only what is genuinely transient: timeouts, 5xx, 429.
        if (error instanceof DiscordApiError) {
          return error.status === 429 || error.status >= 500;
        }
        return true;
      },
    },
  );
}

async function toApiError(response: Response): Promise<DiscordApiError> {
  const retryHeader = response.headers.get('retry-after');
  const retryAfterMs = retryHeader === null ? null : Math.max(0, Number(retryHeader) * 1000 || 0);

  // Discord's JSON `message` is written for its own client, so it is used as
  // extra context only — never as the whole sentence the user reads.
  let detail = '';
  try {
    const body = (await response.json()) as { message?: string };
    if (typeof body.message === 'string') detail = body.message.trim();
  } catch {
    // Sometimes an HTML error page comes back; the status is enough.
  }

  // Never surface a bare "401: Unauthorized" — it is noise, not an explanation.
  const suffix = detail.length > 0 ? ` Discord said: "${detail}"` : '';

  if (response.status === 401) {
    return new DiscordApiError(
      `That token was rejected by Discord, so it is not valid.${suffix} If you have just changed ` +
        'your password or enabled 2FA, reset your password on discord.com and sign in again to ' +
        'get a fresh token.',
      401,
    );
  }
  if (response.status === 403) {
    return new DiscordApiError(
      `Discord refused the request for this account.${suffix} The account may be locked, ` +
        'under review, or missing a required agreement.',
      403,
    );
  }
  if (response.status === 429) {
    return new DiscordApiError(
      'Rate limited by Discord. Wait a moment and try again.',
      429,
      retryAfterMs,
    );
  }

  const label = response.statusText.length > 0 ? ` ${response.statusText}` : '';
  return new DiscordApiError(
    `Discord returned ${response.status}${label}.${suffix}`,
    response.status,
  );
}

/** Maps an API failure onto the vocabulary the account list renders. */
function classify(error: unknown): { status: AccountStatus; message: string } {
  if (error instanceof DiscordApiError) {
    if (error.status === 401) return { status: 'expired', message: error.message };
    if (error.status === 403) return { status: 'locked', message: error.message };
    if (error.status === 429) return { status: 'error', message: error.message };
    return { status: 'error', message: error.message };
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return { status: 'error', message: 'Discord did not respond in time.' };
  }
  return {
    status: 'error',
    message: 'Could not reach Discord. Check your network connection.',
  };
}

/** `GET /users/@me` — validates a token and returns the owning account. */
export async function fetchCurrentUser(token: string): Promise<DiscordUser> {
  if (!looksLikeToken(token)) {
    throw new DiscordApiError(
      'That does not look like a complete Discord token. Copy the whole value — ' +
        'a token is roughly 70 characters long, and a truncated one is rejected.',
      0,
    );
  }
  log.debug('Validating token against /users/@me');
  return request<DiscordUser>('/users/@me', token);
}

export async function checkToken(token: string): Promise<TokenCheck> {
  try {
    const user = await fetchCurrentUser(token);
    return { valid: true, user, status: 'valid', message: 'Token is active.' };
  } catch (error) {
    const { status, message } = classify(error);
    return { valid: false, user: null, status, message };
  }
}

export { classify as classifyApiError };
