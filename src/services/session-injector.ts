/**
 * Signs a browser tab into (or out of) a Discord account by handing the session
 * token to the page and reloading it.
 *
 * This is the same mechanism Discord's own web client uses to restore a
 * session, so no privileged API is involved — we are changing local browser
 * state on a machine the user controls, for an account they own.
 *
 * The client is fussy about *how* it is handed the token: it keeps the live
 * session in memory and mirrors it into `localStorage` around unload, so a
 * plain storage write is easily overwritten again. `installPageSession` deals
 * with that; this module only picks the tab, calls it, and reloads.
 */

import { DISCORD, TIMING } from '../core/constants';
import { createLogger } from '../core/logger';
import { sleep } from '../core/utils/async';
import { findDiscordTab } from './token-extractor';

const log = createLogger('session');

export interface SignInOutcome {
  tabId: number;
  reused: boolean;
}

/** Why a sign-in failed, machine-readable so the caller can pick a response. */
export type SignInFailureReason =
  | 'unreachable'
  | 'no-answer'
  | 'blocked'
  | 'no-storage'
  | 'write-rejected';

export class SignInError extends Error {
  /**
   * `null` for failures the caller has no better answer to than showing
   * `message`. `signIn` uses it to decide whether one automatic recovery is
   * worth trying; the UI only ever renders `message`.
   */
  readonly reason: SignInFailureReason | null;

  constructor(message: string, reason: SignInFailureReason | null = null) {
    super(message);
    this.name = 'SignInError';
    this.reason = reason;
  }
}

/** Storage keys passed into the injected function, supplied via `args`. */
interface PageWriteKeys {
  token: string;
  discriminator: string;
}


/** What the injected function resolves to. Never `undefined` — see below. */
interface PageWrite {
  /**
   * The document the function actually ran in. Reported so a write that landed
   * somewhere unexpected — a blank or wrapper frame — can be named instead of
   * guessed at.
   */
  url: string;
  written: boolean;
  cleared: boolean;
  previous: string | null;
  error: string | null;
  /**
   * True when Discord's own token store accepted the value. The storage write
   * succeeds either way; this only records how much of the client agreed.
   */
  viaTokenStore: boolean;
}

/**
 * Picks the frame whose answer should be acted on, given one result per frame.
 *
 * Frame 0 is asked first because the app normally lives there — but it is not
 * always the frame holding the session. Discord nests its app, and a top frame
 * can be a wrapper, or a document that has not committed yet, with no Storage
 * object at all while a child frame holds the real one. The extractor probes
 * every frame for exactly that reason; the write path has to do the same, or a
 * perfectly signable tab is reported as unusable.
 *
 * Preference: a frame that stored (or cleared) the value; among those, the one
 * Discord's own store answered for; failing everything, a blocked frame over
 * one with no storage, because "site data is switched off" is actionable while
 * "no storage in this frame" is not. Exported only for the smoke script.
 */
export function pickWriteOutcome(
  results: readonly (PageWrite | null | undefined)[],
): PageWrite | null {
  const answered = results.filter(
    (entry): entry is PageWrite => entry !== null && entry !== undefined,
  );

  const stored = answered.filter((entry) => entry.written || entry.cleared);
  if (stored.length > 0) return stored.find((entry) => entry.viaTokenStore) ?? stored[0] ?? null;

  return answered.find((entry) => entry.error === 'blocked') ?? answered[0] ?? null;
}

/**
 * Serialised into the page. Must be self-contained: no imports, no closures —
 * `executeScript` copies this function's own source, so a helper declared next
 * to it in this file would not exist inside the page.
 *
 * Discord's client no longer boots from a bare storage read: it holds the
 * session in memory and mirrors it into `localStorage` while the page unloads.
 * Two consequences shape this function.
 *
 * First, a plain "write then reload" is not enough. The client's own unload
 * handler publishes the session it holds in memory, so the write can be undone
 * by the very reload meant to activate it — which is why that alone is
 * unreliable. A one-shot unload listener registered here runs *after* that
 * handler (listeners fire in registration order, and ours is added last), and
 * removes itself, so later navigations are left alone.
 *
 * Second, the client's own `setToken` is used when it can be found, since that
 * is the mechanism Discord itself persists a session with, and it keeps the
 * in-memory state consistent with what was written.
 *
 * Exported only so `scripts/page-session-smoke.mjs` can evaluate this exact
 * function the way the browser does; no application code imports it.
 */
export async function installPageSession(
  keys: PageWriteKeys,
  value: string | null,
): Promise<PageWrite> {
  const result: PageWrite = {
    url: String(window.location?.href ?? ''),
    written: false,
    cleared: false,
    previous: null,
    error: null,
    viaTokenStore: false,
  };

  // A document with no Storage object — about:blank, data:, or a wrapper frame
  // on a page that nests its app — has `window.localStorage === undefined`, so
  // calling `.getItem` on it throws a TypeError that says nothing useful. A
  // browser that refuses the property outright (site data switched off for the
  // site) throws instead: a different problem, with a different fix, so the two
  // are named separately and the caller can reach for the right sentence.
  let local: Storage | null = null;
  try {
    local = window.localStorage ?? null;
  } catch {
    result.error = 'blocked';
    return result;
  }

  if (local === null) {
    result.error = 'no-storage';
    return result;
  }

  const area: Storage = local;

  // Discord keeps the value JSON-encoded, which is why reading it back can
  // produce a quoted string. Writing it bare would be read as a parse failure,
  // so storage gets the quoted form and the client's own API gets the raw token
  // — the same round trip Discord does for itself.
  const encode = (token: string): string => JSON.stringify(token);

  /**
   * Names a thrown value without trusting `instanceof Error`: an error raised
   * across a realm boundary — an iframe, an injected callback — is not an
   * instance of *this* realm's Error, and would be reported as a generic
   * storage failure instead of what actually went wrong.
   */
  const describe = (error: unknown): string => {
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === 'string' && message.length > 0
      ? message
      : 'Storage access was blocked.';
  };

  /** Re-asserts the intended end state when the page unloads. */
  const hold = (token: string | null): void => {
    const enforce = (): void => {
      try {
        if (token === null) area.removeItem(keys.token);
        else area.setItem(keys.token, encode(token));
        area.removeItem(keys.discriminator);
      } catch {
        // The unload path has nowhere to report, and nothing left to do.
      }
    };
    window.addEventListener('beforeunload', enforce, { once: true });
    window.addEventListener('pagehide', enforce, { once: true });
  };
  /** Discord's own token setter, when this build exposes one. */
  const findTokenStore = (): { setToken(token: string): unknown } | null => {
    const container = (window as unknown as { webpackChunkdiscord_app?: unknown[] })
      .webpackChunkdiscord_app;
    if (!Array.isArray(container)) return null;

    let found: { setToken(token: string): unknown } | null = null;
    try {
      (container as unknown as { push(chunk: unknown[]): void }).push([
        [Symbol('dtl')],
        {},
        (require: { c?: Record<string, { exports?: unknown }> }) => {
          const modules: Record<string, { exports?: unknown }> = require?.c ?? {};
          for (const module of Object.values(modules)) {
            try {
              const exports = module?.exports as Record<string, unknown> | undefined;
              if (exports === null || exports === undefined) continue;

              for (const namespace of [exports, exports['default']]) {
                if (typeof namespace !== 'object' || namespace === null) continue;
                const bag = namespace as Record<string, unknown>;
                // The pair of getters marks the auth store: the module Discord
                // itself reads a session from and writes a session to.
                if (typeof bag['getToken'] !== 'function') continue;
                if (typeof bag['setToken'] !== 'function') continue;
                found = bag as unknown as { setToken(token: string): unknown };
                return;
              }
            } catch {
              // Not the module we are looking for.
            }
          }
        },
      ]);
    } catch {
      // A page that refuses the push has no store to offer.
    } finally {
      try {
        (container as unknown[]).pop();
      } catch {
        // Popping is hygiene, not correctness.
      }
    }
    return found;
  };

  const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  if (value === null) {
    try {
      result.previous = area.getItem(keys.token);
      area.removeItem(keys.token);
      area.removeItem(keys.discriminator);
    } catch (error) {
      result.error = describe(error);
      return result;
    }
    hold(null);
    result.cleared = true;
    return result;
  }

  try {
    result.previous = area.getItem(keys.token);
    area.setItem(keys.token, encode(value));
    // Discord uses this to pick the token parsing strategy; a stale value from
    // the previous account would make the new token parse incorrectly.
    area.removeItem(keys.discriminator);
    result.written = true;
  } catch (error) {
    result.error = describe(error);
    return result;
  }

  hold(value);

  // The module cache fills in as the bundle boots, so give the page a moment
  // rather than reading a half-initialised app.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const store = findTokenStore();
    if (store === null) {
      await pause(150);
      continue;
    }
    try {
      await store.setToken(value);
      result.viaTokenStore = true;
    } catch {
      // The storage write above stands on its own.
    }
    break;
  }

  return result;
}

/** The arguments every injection receives: the keys to use and the value to set. */
function writeArgs(value: string | null): [PageWriteKeys, string | null] {
  return [{ token: DISCORD.TOKEN_STORAGE_KEY, discriminator: DISCORD.TOKEN_VERSION_KEY }, value];
}

/**
 * One `executeScript` call, normalised to the frames that answered.
 *
 * A frame that threw outright carries `error` and no result; that is a failure
 * of one frame, not of the tab, so it is dropped here and the answer is judged
 * on the frames that did reply — the same reading the extractor applies to its
 * own injections.
 */
async function injectInto(
  target: chrome.scripting.InjectionTarget,
  value: string | null,
): Promise<PageWrite[]> {
  const injections = await chrome.scripting.executeScript<
    PageWrite,
    [PageWriteKeys, string | null]
  >({
    target,
    world: 'MAIN',
    func: installPageSession,
    args: writeArgs(value),
  });

  const answered: PageWrite[] = [];
  for (const entry of injections) {
    if (entry.error !== undefined) continue;
    if (entry.result === undefined || entry.result === null) continue;
    answered.push(entry.result);
  }
  return answered;
}

/** The sentence a failed write deserves, chosen by machine-readable reason. */
function writeFailure(outcome: PageWrite | null): SignInError {
  if (outcome === null) {
    return new SignInError(
      'The Discord page did not answer the extension. Reload it and try again.',
      'no-answer',
    );
  }
  if (outcome.error === 'blocked') {
    return new SignInError(
      'Your browser is blocking site data for discord.com, so a session cannot be written. ' +
        'Allow cookies and site data for discord.com, then try again.',
      'blocked',
    );
  }
  if (outcome.error === 'no-storage') {
    return new SignInError(
      'That Discord tab has no page that can hold a session — every frame the extension ' +
        'could reach came back without storage. Reload the tab, wait for your channels to ' +
        `appear, then try again.${outcome.url.length > 0 ? ` (The tab reported: ${outcome.url}.)` : ''}`,
      'no-storage',
    );
  }
  return new SignInError(
    `Discord's storage rejected the write: ${outcome.error ?? 'unknown error'}`,
    'write-rejected',
  );
}

/** One frame per line, for the log a rare failure deserves. */
function describeFrames(frames: readonly PageWrite[]): string {
  if (frames.length === 0) return 'no frame answered';
  return frames
    .map((frame) => `${frame.url.length > 0 ? frame.url : '(no url)'} -> ${frame.error ?? 'ok'}`)
    .join('; ');
}

/**
 * Writes the value into the tab, asking the top frame first.
 *
 * The top frame is where the app normally lives, so the ordinary case costs one
 * injection. When that frame had nowhere to put the value, the other frames get
 * a turn — see `pickWriteOutcome` for why that fallback exists. Any *other*
 * failure (site data blocked, a refused write) is a property of the tab rather
 * than of the frame, so it is reported as it stands instead of retried.
 */
async function inject(tabId: number, value: string | null): Promise<PageWrite> {
  let top: PageWrite[];
  try {
    top = await injectInto({ tabId, frameIds: [0] }, value);
  } catch {
    // Thrown for tabs the extension cannot script at all.
    throw new SignInError('That Discord tab could not be reached. Open discord.com and retry.');
  }

  const answer = pickWriteOutcome(top);
  if (answer !== null && (answer.written || answer.cleared)) return answer;
  if (answer === null || answer.error !== 'no-storage') throw writeFailure(answer);

  const frames = await injectInto({ tabId, allFrames: true }, value).catch((): PageWrite[] => []);
  const recovered = pickWriteOutcome(frames);
  if (recovered !== null && (recovered.written || recovered.cleared)) return recovered;

  // This failure is rare and environment-specific, and the per-frame answers
  // are the fastest way to tell a document that was blank from a page whose
  // storage the browser has taken away.
  log.info(`No frame could hold the session: ${describeFrames(frames)}`);
  throw writeFailure(recovered ?? answer);
}

/**
 * Writes the token, with one automatic recovery for the case the user would
 * otherwise fix by hand.
 *
 * "No frame has storage" is almost always a document that could not hold a
 * session — a blank, detached or mid-replacement frame the tab was briefly
 * reporting as its own — and the standing advice is "reload the tab and try
 * again". That is mechanical, so the extension does it once itself rather than
 * asking: reload, let the new document settle, then write again. Every other
 * failure (site data blocked, a refused write) is a property of the profile or
 * the tab, and reloading would not change it.
 */
async function writeWithRecovery(tabId: number, token: string): Promise<PageWrite> {
  try {
    return await inject(tabId, token);
  } catch (error) {
    if (!(error instanceof SignInError) || error.reason !== 'no-storage') throw error;

    log.warn('No frame could hold the session; reloading the tab once and retrying.');
    await chrome.tabs.reload(tabId);

    // Polling alone cannot distinguish the stale document, which keeps
    // reporting `complete` until it is replaced, from the new one.
    await sleep(TIMING.RELOAD_SETTLE_MS);
    if (!(await waitForAppDocument(tabId))) {
      throw new SignInError(
        'That Discord tab never reached discord.com, so there was nowhere to sign in. ' +
          'Reload it and try again.',
        'unreachable',
      );
    }

    return inject(tabId, token);
  }
}

/**
 * Resolves the tab to use, creating one if the user asked for a dedicated
 * window. Reuses an existing Discord tab so switching accounts feels instant
 * instead of piling up tabs.
 */
async function resolveTargetTab(openInNewWindow: boolean): Promise<{ tabId: number; reused: boolean }> {
  if (openInNewWindow) {
    const window = await chrome.windows.create({ url: DISCORD.APP_URL, focused: true });
    const tab = window.tabs?.[0];
    if (tab?.id === undefined) throw new SignInError('Could not open a Discord window.');
    return { tabId: tab.id, reused: false };
  }

  try {
    const existing = await findDiscordTab();
    if (existing.id !== undefined) {
      await chrome.tabs.update(existing.id, { active: true });
      return { tabId: existing.id, reused: true };
    }
  } catch {
    // No Discord tab yet — fall through and open one.
  }

  const created = await chrome.tabs.create({ url: DISCORD.APP_URL, active: true });
  if (created.id === undefined) throw new SignInError('Could not open a Discord tab.');
  return { tabId: created.id, reused: false };
}

/**
 * Waits until the tab is holding a *committed* discord.com document.
 *
 * `waitForDocument` watches the tab's load state alone, and a tab reports
 * `complete` for whatever document it is currently holding — including the
 * blank one a freshly created window starts on and a restored session can sit
 * on. Writing there is the "no storage" failure, so the URL is checked too, and
 * a tab that never reaches discord.com is named instead of written to. A
 * committed page that is still booting is good enough: the client's own writes
 * during boot are handled by the unload guard and `setToken`.
 */
async function waitForAppDocument(
  tabId: number,
  timeoutMs = TIMING.TAB_READY_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    let tab: chrome.tabs.Tab | null = null;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return false; // The tab closed while we were waiting for it.
    }

    const url = tab.url ?? '';
    const committed = url.startsWith(DISCORD.ORIGIN);
    if (committed && tab.status === 'complete') return true;
    if (Date.now() > deadline) return committed; // Slow boot; still writable.

    await sleep(TIMING.TAB_POLL_MS);
  }
}

/**
 * Signs a tab in as the account owning `token`.
 *
 * Ordering matters: the document has to be a committed Discord page before we
 * write, otherwise the value lands in a blank document that has no storage (or
 * Discord's boot sequence overwrites it with the empty one it writes during
 * initialisation). The reload that follows is what makes the client read the
 * session back — the token is never hot-swapped in a live tab.
 */
export async function signIn(
  token: string,
  options: { openInNewWindow?: boolean } = {},
): Promise<SignInOutcome> {
  const { tabId, reused } = await resolveTargetTab(options.openInNewWindow ?? false);

  if (!(await waitForAppDocument(tabId))) {
    throw new SignInError(
      'That Discord tab never reached discord.com, so there was nowhere to sign in. ' +
        'Reload it and try again.',
    );
  }

  const result = await writeWithRecovery(tabId, token);

  await chrome.tabs.reload(tabId);
  log.info(
    `Signed in on tab ${tabId}${reused ? ' (reused)' : ' (new)'}` +
      `${result.viaTokenStore ? ' via the client token store' : ' (storage only)'}` +
      `${result.url.length > 0 ? ` in ${result.url}` : ''}`,
  );
  return { tabId, reused };
}

/** Clears the session from every open Discord tab. */
export async function signOut(): Promise<number> {
  const tabs = await chrome.tabs.query({ url: DISCORD.MATCH_PATTERN });
  const targets = tabs.filter((tab) => tab.id !== undefined);

  let cleared = 0;
  for (const tab of targets) {
    try {
      const result = await inject(tab.id as number, null);
      if (result?.cleared === true) {
        await chrome.tabs.reload(tab.id as number);
        cleared += 1;
      }
    } catch (error) {
      // One unreachable tab must not abort the sweep.
      log.warn(`Could not clear tab ${tab.id}`, error);
    }
  }

  log.info(`Signed out of ${cleared} tab(s)`);
  return cleared;
}

/** Brings a Discord tab to the front, opening the app if none exists. */
export async function focusDiscord(): Promise<void> {
  try {
    const tab = await findDiscordTab();
    if (tab.id !== undefined) {
      await chrome.tabs.update(tab.id, { active: true, url: tab.url ?? DISCORD.APP_URL });
      return;
    }
  } catch {
    // Nothing open yet.
  }
  await chrome.tabs.create({ url: DISCORD.APP_URL, active: true });
}
