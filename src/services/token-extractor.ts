/**
 * Reads a live Discord session's token out of the page.
 *
 * The read happens in the page's own JavaScript context (`world: 'MAIN'`).
 * That is unavoidable: page storage and the client's own modules belong to the
 * page, and an extension content script runs in an isolated world with a
 * different view of both. The function below is injected, runs, and returns;
 * nothing is left behind and no listener is registered on the page.
 *
 * Discord no longer keeps the token under a fixed storage key. The running
 * client holds it in memory and mirrors it into `localStorage` only while the
 * page is unloading, so `localStorage.getItem('token')` comes back empty on a
 * session that is very much alive. Capture therefore walks four layers — the
 * documented keys, a synthetic unload event, the client's own `getToken()`, and
 * a bounded scan of storage values — and hands back every plausible value it
 * found rather than the first one.
 *
 * That last part is deliberate. Several unrelated modules in the client hand out
 * strings with exactly a token's length and character set — a captcha, an
 * analytics id, a nonce — and no amount of local cleverness tells them apart
 * from a session. So the page only *proposes*, and Discord decides: candidates
 * are tried in order of how much they can be trusted and the first one accepted
 * wins. A false positive costs one request instead of the whole capture.
 */

import { DISCORD, NETWORK, TIMING } from '../core/constants';
import { createLogger } from '../core/logger';
import { sleep } from '../core/utils/async';
import { checkToken } from './discord-client';

const log = createLogger('extract');

/** Storage keys the injected function reads, passed in via `args`. */
interface PageKeys {
  token: string;
  discriminator: string;
}

export interface Extraction {
  token: string;
  /**
   * Where the token came from. `memory` is the normal answer on a current
   * build: it was handed over by the running client rather than read from a
   * storage key.
   */
  origin: 'localStorage' | 'sessionStorage' | 'memory';
  /** Storage key holding the token, or null when it came from client memory. */
  key: string | null;
}

export class NoDiscordTabError extends Error {
  readonly reason: 'unreachable' | 'no-storage' | null;
  constructor(
    message = 'Open discord.com in a tab first, then try again.',
    reason: 'unreachable' | 'no-storage' | null = null,
  ) {
    super(message);
    this.name = 'NoDiscordTabError';
    this.reason = reason;
  }
}

/**
 * How a frame answered. `ok` is a success value, not a failure, but it lives in
 * the same union so the injected function has exactly one field to set. A
 * machine-readable reason lets the worker choose the right sentence; a raw
 * `TypeError` from the page does not.
 */
type ReadOutcome = 'ok' | 'no-storage' | 'blocked' | 'no-session';

/** Which layer of the probe produced a candidate. */
type ProbeName = 'key' | 'flush' | 'memory' | 'scan';

/** One value a frame believes may be the session token. */
interface PageCandidate {
  token: string;
  origin: 'localStorage' | 'sessionStorage' | 'memory';
  /** Storage key the value sat in, when a storage area produced it. */
  key: string | null;
  probe: ProbeName;
  /**
   * True when the value also has the *structure* of a user token: base64url
   * segments whose first one decodes to a numeric account id. Several unrelated
   * modules hand out strings of the same length and charset — a captcha, an
   * analytics id, a nonce — and shape alone cannot tell them apart.
   */
  strict: boolean;
}

interface PageSession {
  /** Every plausible token this frame holds, in the order it trusts them. */
  candidates: PageCandidate[];
  reason: ReadOutcome;
  /** Reported back only to build a message, never shown raw. */
  frameUrl: string;
  /**
   * Storage key *names* found in the page, with values never included. Key
   * names are schema, not secrets, and seeing them is the only way to tell
   * "not signed in" apart from "signed in, but Discord moved the token".
   */
  storageKeys: string[];
  /**
   * Diagnostics, never secrets: whether the client's bundle was reachable, and
   * whether it exposed an auth module at all. Without them a failed capture
   * cannot be told apart from a page that had not finished loading.
   */
  hasApp: boolean;
  hasTokenFn: boolean;
}

/**
 * Serialised into the page. Everything it needs arrives via `args`, and every
 * helper it calls is declared inside it: `executeScript` copies this function's
 * own source into the page, so anything from module scope — including a helper
 * written next to it in this file — does not exist there.
 *
 * Discord writes the token JSON-encoded, so `getItem('token')` can come back
 * quoted. A quoted value is then sent verbatim as `"abc.def…"`, which Discord
 * rejects with a 401, so everything below unwraps before looking at it.
 *
 * Exported only so `scripts/page-session-smoke.mjs` can evaluate this exact
 * function the way the browser does; no application code imports it.
 */
export function readPageSession(keys: PageKeys): PageSession {
  /** The token charset: base64url segments, no whitespace, 50-300 characters. */
  const TOKEN_SHAPE = /^[A-Za-z0-9._~+/=-]{50,300}$/;
  /** A token inside a larger blob: three dot-separated base64url segments. */
  const TOKEN_INSIDE = /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}/;
  /** Key names that plausibly hold a credential, gating blob extraction. */
  const CREDENTIAL_KEY = /token|auth|session|credential|secret/i;
  /** How many lookalike values to keep: enough to be useful, bounded. */
  const MAX_LOOKALIKES = 3;

  const candidates: PageCandidate[] = [];
  const report: PageSession = {
    candidates,
    reason: 'no-session',
    frameUrl: '',
    storageKeys: [],
    hasApp: false,
    hasTokenFn: false,
  };

  try {
    report.frameUrl = String(window.location?.href ?? '');
  } catch {
    // Opaque origin; the URL is a nicety, not a requirement.
  }

  // A document with no Storage object — about:blank, data:, file://, or a
  // sandboxed frame — has `window.localStorage === undefined`. Calling
  // `.getItem` on that throws a TypeError that explains nothing to a user, so
  // the case is named here. Reading the property can itself throw on an opaque
  // origin, which is a different and equally namable case.
  let blocked = false;
  let local: Storage | null = null;
  try {
    local = window.localStorage ?? null;
  } catch {
    blocked = true;
  }

  // A frame may have no Storage object while the client is alive (a blank or
  // wrapper frame), so this is recorded — not returned — until every probe
  // has run. Only a frame with no candidate from any layer keeps `no-storage`.
  const storageMissing = local === null && !blocked;

  const stores: Array<[Storage, 'localStorage' | 'sessionStorage']> = [];
  if (local !== null) stores.push([local, 'localStorage']);
  try {
    const session = window.sessionStorage;
    if (session !== null && session !== undefined) stores.push([session, 'sessionStorage']);
  } catch {
    // Session storage is optional; local storage already covers the app.
  }

  report.hasApp =
    typeof (window as unknown as { webpackChunkDiscord_app?: unknown }).webpackChunkDiscord_app !==
    'undefined';

  /** Unwraps Discord's JSON encoding without ever throwing. */
  const unwrap = (raw: string): string => {
    const text = raw.trim();
    if (!text.startsWith('"')) return text;
    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === 'string' ? parsed.trim() : text;
    } catch {
      return text;
    }
  };

  /** Loose test: the right shape for a token. Length and charset, nothing more. */
  const isTokenish = (value: string): boolean => TOKEN_SHAPE.test(value);

  /** Decodes one base64url segment, tolerating missing padding. */
  const decodeSegment = (segment: string): string => {
    try {
      const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
      return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    } catch {
      return '';
    }
  };

  /**
   * The structure of a real user token: base64url segments whose first one
   * decodes to the account's numeric id. It costs one `atob`, and it is what
   * separates a session token from a captcha or an analytics id, which are
   * otherwise the same length and the same charset. A value that fails is still
   * kept — last — because a future format change should not cost us a token.
   */
  const isUserToken = (value: string): boolean => {
    if (!isTokenish(value)) return false;
    const parts = value.split('.');
    // An MFA token carries the id after an `mfa.` prefix instead of base64.
    if (parts.length === 2) return parts[0] === 'mfa';
    if (parts.length !== 3) return false;
    return /^\d{17,20}$/.test(decodeSegment(parts[0] as string));
  };

  /**
   * Records a candidate. Duplicates collapse to their first, most trustworthy,
   * sighting, because the same value is normally reachable by more than one
   * layer and reporting it twice would only make the worker check it twice.
   */
  const add = (
    token: string,
    origin: 'localStorage' | 'sessionStorage' | 'memory',
    key: string | null,
    probe: ProbeName,
  ): void => {
    if (!isTokenish(token)) return;
    if (candidates.some((entry) => entry.token === token)) return;
    candidates.push({ token, origin, key, probe, strict: isUserToken(token) });
  };

  /** Reads the documented key from every storage area that still has it. */
  const readKey = (probe: ProbeName): void => {
    for (const [store, origin] of stores) {
      try {
        const raw = store.getItem(keys.token);
        if (raw === null) continue;
        add(unwrap(raw), origin, keys.token, probe);
      } catch {
        // Storage access can be refused outright by site settings.
        blocked = true;
      }
    }
  };

  // 1. The documented keys. The whole answer on older builds, and on a page that
  //    has only just finished loading.
  readKey('key');

  // 2. Ask the client to publish. Discord mirrors its in-memory token back into
  //    storage while the page unloads, so a synthetic unload event is the one way
  //    to make a *running* client part with it. Nothing is written here — we
  //    only ring the bell the client itself answers.
  try {
    window.dispatchEvent(new Event('beforeunload'));
  } catch {
    // A synthetic event is a hint, never a requirement.
  }

  readKey('flush');

  // 3. Ask the client itself. The running app hands out its token through its
  //    own auth module, and the bundle's chunk array doubles as the module
  //    cache: pushing a no-op chunk gives the callback `require`, and with it
  //    every module the page has loaded. The entry is popped again afterwards,
  //    which leaves the page exactly as it was found.
  //
  //    Values come back in two buckets. The auth store is the one that can also
  //    *write* a token, which is the module Discord itself reads a session from;
  //    anything else with a `getToken` is a lookalike, kept but ranked below
  //    every value with a known provenance.
  const askClient = (): { authentic: string[]; lookalike: string[] } => {
    const found: { authentic: string[]; lookalike: string[] } = { authentic: [], lookalike: [] };
    const container = (window as unknown as { webpackChunkdiscord_app?: unknown[] })
      .webpackChunkdiscord_app;
    if (!Array.isArray(container)) return found;

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

              // Current builds put the pair straight on the module, older ones
              // on its default export. Both spellings are checked; neither is
              // assumed, because a rename is exactly the kind of change that
              // has to be absorbed silently.
              for (const namespace of [exports, exports['default']]) {
                if (typeof namespace !== 'object' || namespace === null) continue;
                const bag = namespace as Record<string, unknown>;
                if (typeof bag['getToken'] !== 'function') continue;

                report.hasTokenFn = true;
                const value: unknown = (bag['getToken'] as () => unknown).call(bag);
                if (typeof value !== 'string' || !isTokenish(value)) continue;

                if (typeof bag['setToken'] === 'function') found.authentic.push(value);
                else if (found.lookalike.length < MAX_LOOKALIKES) found.lookalike.push(value);
              }
            } catch {
              // A module whose getter throws is not the auth module.
            }
          }
        },
      ]);
    } catch {
      // A page that refuses the push simply has no app to ask.
    } finally {
      try {
        (container as unknown[]).pop();
      } catch {
        // Popping is hygiene, not correctness.
      }
    }

    return found;
  };

  // 4. Storage values, for a build that has moved the token somewhere new. A
  //    value that *is* a session token wins outright whatever its key is called;
  //    one that only has the right shape is kept behind it. A token buried inside
  //    a blob is lifted out only when the key says what the blob holds, because
  //    guessing inside arbitrary values produces false hits.
  const scanStorage = (
    store: Storage,
  ): Array<{ token: string; key: string }> => {
    const loose: Array<{ token: string; key: string }> = [];

    for (const key of Object.keys(store)) {
      if (key.startsWith('__')) continue;
      const raw = store.getItem(key);
      if (raw === null || raw.length < 50 || raw.length > 4096) continue;

      const value = unwrap(raw);
      if (isUserToken(value)) return [{ token: value, key }];

      if (loose.length === 0 && isTokenish(value)) loose.push({ token: value, key });

      if (loose.length < MAX_LOOKALIKES && raw.length <= 2048 && CREDENTIAL_KEY.test(key)) {
        const match = TOKEN_INSIDE.exec(raw);
        if (match !== null && isTokenish(match[0])) loose.push({ token: match[0], key });
      }
    }

    return loose;
  };

  // Assembly order is the trust order: the storage keys first, then the client's
  // own auth store, then anything else found in storage, then module
  // lookalikes. The worker moves the structurally valid values to the front of
  // this list and asks Discord which one is real.
  const client = askClient();
  for (const value of client.authentic) add(value, 'memory', null, 'memory');

  for (const [store, origin] of stores) {
    try {
      for (const found of scanStorage(store)) add(found.token, origin, found.key, 'scan');
    } catch {
      blocked = true;
    }
  }

  for (const value of client.lookalike) add(value, 'memory', null, 'memory');

  // Storage may be unreachable while memory answered: those frames are `ok`.
  // Only a frame with nothing from any layer stays `no-storage`.
  if (candidates.length === 0 && storageMissing) {
    report.reason = 'no-storage';
    return report;
  }

  // Nothing plausible at all. Report what the page *does* hold, because that is
  // what separates "signed out" from "signed in, but the token lives elsewhere".
  if (candidates.length === 0) {
    try {
      report.storageKeys = Object.keys(window.localStorage)
        .filter((name) => !name.startsWith('__'))
        .slice(0, 12);
    } catch {
      // Leave the list empty; the message degrades to the generic one.
    }
  }

  report.reason = candidates.length > 0 ? 'ok' : blocked ? 'blocked' : 'no-session';
  return report;
}


/** Discord tabs, best candidate first: focused, then most-recently-active. */
export async function findDiscordTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ url: DISCORD.MATCH_PATTERN });
  if (tabs.length === 0) throw new NoDiscordTabError();

  const scored = tabs
    .filter((tab) => tab.id !== undefined)
    .sort((a, b) => {
      const activeA = a.active ? 1 : 0;
      const activeB = b.active ? 1 : 0;
      if (activeA !== activeB) return activeB - activeA;
      // Prefer a loaded document over one still loading or discarded.
      return Number(b.status === 'complete') - Number(a.status === 'complete');
    });

  const best = scored[0];
  if (best?.id === undefined) throw new NoDiscordTabError('No usable Discord tab was found.');
  return best;
}

/**
 * Waits until the tab is holding a *committed* discord.com document, so a read
 * is never thrown away by a navigation racing the script.
 *
 * `tab.status === 'complete'` alone is not enough: a tab reports `complete`
 * for whatever document it is currently holding — including the blank one a
 * freshly created window starts on and a restored session can sit on. Reading
 * there is the `no-storage` failure, so the URL is checked too. Resolves
 * `false` when the tab never reaches discord.com (or vanishes mid-wait), so
 * the caller can ask for a reload instead of reading a dead document.
 */
export async function waitForDocument(
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
    if (Date.now() > deadline) return committed; // Slow boot; still readable.
    await sleep(TIMING.TAB_POLL_MS);
  }
}

/**
 * Flattens what every frame found into one list, most trustworthy first.
 *
 * Two things decide the order: the trust the page recorded — `strict` means the
 * value has the *structure* of a user token, not merely its length and charset —
 * and, inside each tier, the order the layers found things in. Duplicates
 * collapse to their best appearance, which matters because the same value is
 * normally reachable through more than one layer.
 *
 * Pure, and exported so the smoke test can drive it without a browser.
 */
export function rankCandidates(sessions: PageSession[]): PageCandidate[] {
  const best = new Map<string, PageCandidate>();

  for (const session of sessions) {
    for (const candidate of session.candidates) {
      const seen = best.get(candidate.token);
      // A stricter sighting of a value already seen replaces the earlier one.
      if (seen === undefined || (candidate.strict && !seen.strict)) {
        best.set(candidate.token, { ...candidate });
      }
    }
  }

  const ranked = [...best.values()];
  return [...ranked.filter((entry) => entry.strict), ...ranked.filter((entry) => !entry.strict)];
}

/**
 * Asks Discord which candidate is real.
 *
 * The page cannot tell a session token from a captcha, an analytics id or a
 * nonce: unrelated modules hand out strings of exactly the same length and
 * charset, and only Discord knows the difference. So candidates are tried in
 * order of how much they can be trusted, and the first one Discord accepts wins.
 * The cap keeps a page full of junk from turning one capture into a burst of
 * requests.
 */
async function firstWorkingToken(ranked: PageCandidate[]): Promise<Extraction> {
  const attempts = ranked.slice(0, NETWORK.CAPTURE_CANDIDATE_LIMIT);
  let last = '';

  for (const [index, candidate] of attempts.entries()) {
    const result = await checkToken(candidate.token);

    if (result.valid) {
      log.info(
        `Captured a live session token from ${candidate.origin}` +
          `${candidate.key === null ? '' : ` (${candidate.key})`}` +
          ` via the ${candidate.probe} probe` +
          `${index === 0 ? '' : `, after Discord rejected ${String(index)} earlier value(s)`}`,
      );
      return { token: candidate.token, origin: candidate.origin, key: candidate.key };
    }

    last = result.message;
    log.info(
      `A value from the ${candidate.probe} probe was not a usable session (${result.status}); ` +
        'checking the next one.',
    );
  }

  throw new NoDiscordTabError(
    `That tab held ${String(attempts.length)} token-shaped value(s) and Discord rejected ` +
      `every one of them, so there is no usable session in it. ${last}`,
  );
}

export async function extractTokenFromTab(tab: chrome.tabs.Tab): Promise<Extraction> {
  if (tab.id === undefined) throw new NoDiscordTabError();

  let injections: chrome.scripting.InjectionResult<PageSession>[];
  try {
    // Every frame, not just the top document. Discord nests real content in
    // iframes, and a top frame can be a wrapper or an about:blank that has no
    // Storage object at all while a child frame holds the live session.
    injections = await chrome.scripting.executeScript<PageSession, [PageKeys]>({
      target: { tabId: tab.id, allFrames: true },
      world: 'MAIN',
      func: readPageSession,
      args: [{ token: DISCORD.TOKEN_STORAGE_KEY, discriminator: DISCORD.TOKEN_VERSION_KEY }],
    });
  } catch {
    // Thrown for tabs the extension cannot reach at all: the Chrome Web Store,
    // a PDF viewer, or a tab that was discarded mid-flight.
    throw new NoDiscordTabError('That tab cannot be read. Open discord.com and try again.');
  }

  if (injections.length === 0) {
    throw new NoDiscordTabError('The Discord page had not finished loading. Try again.');
  }

  // A frame that threw outright carries `error` and no result; it is not a
  // failure of the tab, only of that frame.
  const reads = injections
    .filter((entry): entry is { result: PageSession } & typeof entry => {
      return entry.error === undefined && entry.result !== null && entry.result !== undefined;
    })
    .map((entry) => entry.result);

  if (reads.length === 0) {
    throw new NoDiscordTabError('That page blocked the extension from reading it.');
  }

  // Every frame proposes; the ranking decides who is asked first, and Discord
  // decides which one is real.
  const ranked = rankCandidates(reads);
  if (ranked.length > 0) return firstWorkingToken(ranked);
  // No usable token. Name the obstacle the frames actually reported rather than
  // guessing, because "signed out" and "this build hides the token" look
  // identical from the outside and call for opposite advice.
  if (reads.some((read) => read.reason === 'blocked')) {
    throw new NoDiscordTabError(
      'Your browser blocked this extension from reading Discord’s storage. Check that ' +
        'third-party cookies are allowed for discord.com, then try again.',
    );
  }

  if (reads.every((read) => read.reason === 'no-storage')) {
    // Per-frame answers are the fastest way to tell a document that was blank
    // from one whose storage the browser took away — same as the sign-in path.
    const seenFrames = [
      ...new Set(reads.map((read) => read.frameUrl ?? '').filter((url) => url.length > 0)),
    ].slice(0, 3);
    const unreadable = injections.length - reads.length;
    log.warn(
      `No frame could hold the session: ${reads
        .map((read) => `${read.frameUrl || '(no url)'} -> ${read.reason}`)
        .join('; ')}${unreadable > 0 ? ` (${unreadable} frame(s) could not be read)` : ''}`,
    );
    const where = seenFrames.length > 0 ? ` (Frames seen: ${seenFrames.join(', ')}.)` : '';
    throw new NoDiscordTabError(
      'That tab is not a normal web page, so it has nowhere to store a session. ' +
        `Open discord.com/app in a tab and sign in there first.${where}`,
      'no-storage',
    );
  }

  // Signed in or not, the page still told us which keys it holds. Naming them
  // turns "you are not signed in" from a guess into a fact, and is the fastest
  // way to spot Discord moving the token to a new key.
  const seen = [...new Set(reads.flatMap((read) => read.storageKeys))].slice(0, 8);
  const appLoaded = reads.some((read) => read.hasApp);
  const clientAnswered = reads.some((read) => read.hasTokenFn);

  log.info(
    `No token found. App bundle reachable: ${String(appLoaded)}; auth module ` +
      `present: ${String(clientAnswered)}; storage keys: ${seen.join(', ') || 'none'}`,
  );

  const heldBy = (names: string[]): string =>
    names.length === 0 ? '' : ` The tab currently stores: ${names.join(', ')}.`;

  if (clientAnswered) {
    // The client was asked and had nothing to give: that is a signed-out
    // session, and retrying will not change it.
    throw new NoDiscordTabError(
      'That Discord tab is signed out, so there is no token in it to capture. Sign in ' +
        `at discord.com/app, then capture again.${heldBy(seen)}`,
    );
  }

  if (appLoaded) {
    throw new NoDiscordTabError(
      'The Discord app is running in that tab, but this build did not hand over a token. ' +
        'Reload the tab, wait for your channels to appear, then capture again — or copy ' +
        `the token from the Network tab instead.${heldBy(seen)}`,
    );
  }

  throw new NoDiscordTabError(
    'That Discord page has not finished loading its app yet, so there was nothing to ' +
      'read. Reload the tab, wait a moment, then capture again.',
  );
}

/**
 * Reads with one automatic recovery for the case the user would otherwise
 * fix by hand.
 *
 * "No frame has storage" is almost always a document that could not hold a
 * session — a blank, detached or mid-replacement frame the tab was briefly
 * reporting as its own — and the standing advice is "reload the tab and try
 * again". That is mechanical, so the extension does it once itself rather than
 * asking: reload, let the new document settle, then read again. Every other
 * failure (site data blocked, a signed-out tab) is a property of the profile
 * or the tab, and reloading would not change it.
 */
async function extractWithRecovery(tab: chrome.tabs.Tab, timeoutMs = TIMING.TAB_READY_TIMEOUT_MS): Promise<Extraction> {
  const tabId = tab.id as number;
  try {
    return await extractTokenFromTab(tab);
  } catch (error) {
    if (!(error instanceof NoDiscordTabError) || error.reason !== 'no-storage') throw error;

    log.warn('No frame could hold the session; reloading the tab once and retrying.');
    await chrome.tabs.reload(tabId);

    // Polling alone cannot distinguish the stale document, which keeps
    // reporting `complete` until it is replaced, from the new one.
    await sleep(TIMING.RELOAD_SETTLE_MS);
    if (!(await waitForDocument(tabId, timeoutMs))) {
      throw new NoDiscordTabError(
        'That Discord tab never reached discord.com, so there was nothing to read. ' +
          'Reload it and try again.',
        'unreachable',
      );
    }

    return extractTokenFromTab(tab);
  }
}

/** Convenience path used by the popup button and the context menu. */
export async function extractFromActiveSession(timeoutMs = TIMING.TAB_READY_TIMEOUT_MS): Promise<Extraction> {
  const tab = await findDiscordTab();
  const tabId = tab.id as number;
  if (!(await waitForDocument(tabId, timeoutMs))) {
    throw new NoDiscordTabError(
      'That Discord tab never reached discord.com, so there was nothing to read. ' +
        'Reload it and try again.',
      'unreachable',
    );
  }
  return extractWithRecovery(tab, timeoutMs);
}
