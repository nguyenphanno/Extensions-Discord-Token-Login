/**
 * Page-session smoke test.
 *
 * The two functions this extension injects into Discord's page are the one place
 * where "it typechecks" and "the bundler accepted it" prove nothing. Chrome
 * serialises an injected function with `Function.prototype.toString()` and
 * evaluates it in the page's own realm, so the function may reference nothing
 * outside its own body — and a violation does not fail the build, it fails at
 * runtime as a `ReferenceError` swallowed by the function's own `try/catch`.
 *
 * This script reproduces Chrome's model exactly: it takes the built functions'
 * own source, evaluates it in a bare realm holding nothing but a fake page, and
 * drives them. Every case therefore also proves self-containment, because a
 * module binding would be undefined in that realm.
 *
 * The behaviour covered here is what Discord's current client requires: a token
 * held in memory rather than in storage, an unload handler that would otherwise
 * overwrite the token this extension just wrote, and a write that has to pick
 * the frame holding the session when the top frame has no storage of its own.
 *
 * Run with `npm run verify:page`.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src').replace(/\\/g, '/');

/**
 * The suite is bundled and run from a file, so the page double has to live
 * inside the generated entry. It is deliberately mean: no DOM, no timers beyond
 * `setTimeout`, and a bundler chunk array that does exactly what the real one
 * does when a chunk is pushed.
 */
const ENTRY = `
import vm from 'node:vm';
import { rankCandidates, readPageSession } from '${SRC}/services/token-extractor';
import { installPageSession, pickWriteOutcome } from '${SRC}/services/session-injector';

const KEY = 'token';
const DISCRIMINATOR = 'token_discriminator';
const KEYS = { token: KEY, discriminator: DISCRIMINATOR };

/** Token-shaped filler; only the shape matters to the probes. */
const token = (fill) => fill.repeat(24) + '.' + fill.repeat(6) + '.' + fill.repeat(32);
const TOKEN = token('A');
const STALE = token('Z');

/**
 * Values with the real *structure* as well: a first segment that decodes to an
 * account id, which is what separates a session token from a captcha.
 */
const ACCOUNT_ID = '123456789012345678';
const real = (fill) =>
  Buffer.from(ACCOUNT_ID).toString('base64') + '.' + fill.repeat(6) + '.' + fill.repeat(32);
const SESSION = real('B');
const OTHER_SESSION = real('D');

const out = [];
const check = (name, passed) => out.push([name, Boolean(passed)]);

/**
 * A Storage stand-in. Values live as enumerable own properties because that is
 * how a real Storage answers \`Object.keys()\`, which the scan layer relies on;
 * the methods are hidden so they never look like stored data.
 */
function makeStorage(initial) {
  const store = Object.assign({}, initial);
  const methods = {
    getItem: (key) => (Object.hasOwn(store, key) ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
  for (const [name, fn] of Object.entries(methods)) {
    Object.defineProperty(store, name, { value: fn, enumerable: false });
  }
  return store;
}

/** The smallest page that behaves like Discord's app. */
function makePage(options) {
  const settings = options ?? {};
  const listeners = new Map();
  const page = {
    localStorage: makeStorage(settings.local ?? {}),
    sessionStorage: makeStorage(settings.session ?? {}),
    location: { href: 'https://discord.com/app' },
    addEventListener: (type, fn) => {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    /** Handlers run in registration order, like a real event target. */
    dispatchEvent: (event) => {
      for (const fn of listeners.get(event.type) ?? []) fn(event);
      return true;
    },
    /** Test-only: fires a real unload the way a reload would. */
    unload: () => {
      for (const fn of listeners.get('beforeunload') ?? []) fn({ type: 'beforeunload' });
    },
  };
  if (settings.chunks !== undefined) page.webpackChunkdiscord_app = settings.chunks;
  // Discord registers its own unload handler at boot, so it is registered here
  // and therefore runs before anything injected later — which is the whole
  // point of the write path.
  if (settings.onUnload !== undefined) page.addEventListener('beforeunload', settings.onUnload);
  return page;
}

/** The bundler's chunk array: pushing a chunk runs its runtime callback. */
function makeChunks(modules) {
  const array = [];
  array.push = (...entries) => {
    for (const entry of entries) {
      const runtime = Array.isArray(entry) ? entry[2] : undefined;
      if (typeof runtime === 'function') runtime({ c: modules });
      else Array.prototype.push.call(array, entry);
    }
    return array.length;
  };
  return array;
}

/**
 * Chrome's execution model, exactly: the function's own source, evaluated in a
 * realm that contains nothing but the page. A reference to any module binding
 * throws here just as it would in a tab.
 */
function inPage(fn, page) {
  // Event and atob are genuine browser globals the page relies on. The absence
  // of everything *else* is the point: a module binding would throw here.
  const sandbox = {
    window: page,
    Event: Event,
    atob: atob,
    setTimeout: setTimeout,
    console: console,
  };
  vm.createContext(sandbox);
  return vm.runInContext('(' + fn.toString() + ')', sandbox);
}

export async function run() {
  // 1. the documented key, JSON-quoted, is read and unwrapped
  {
    const page = makePage({ local: { token: JSON.stringify(TOKEN) } });
    const result = inPage(readPageSession, page)(KEYS);
    const [first] = result.candidates;
    check('reads the documented key', first.token === TOKEN);
    check('names the key it used', first.probe === 'key' && first.key === KEY);
    check('unwraps the JSON quoting', first.origin === 'localStorage');
  }

  // 2. the case that broke for months: a live session with no storage key,
  //    which publishes its token when the page unloads
  {
    let page;
    page = makePage({
      local: { SelectedGuildStore: '{}', MultiAccountStore: '[]' },
      onUnload: () => { page.localStorage[KEY] = JSON.stringify(TOKEN); },
    });
    const result = inPage(readPageSession, page)(KEYS);
    const [first] = result.candidates;
    check('asks the client to publish on unload', first.probe === 'flush');
    check('gets the token the client flushed', first.token === TOKEN);
  }

  // 3. a client that keeps the token only in memory, as the web app does
  {
    const page = makePage({
      local: { habitualDND: 'true' },
      chunks: makeChunks({ 42: { exports: { getToken: () => TOKEN, setToken: () => {} } } }),
    });
    const result = inPage(readPageSession, page)(KEYS);
    const [first] = result.candidates;
    check('asks the auth module for its token', first.probe === 'memory');
    check('reports memory as the origin', first.origin === 'memory' && first.token === TOKEN);
  }

  // 3b. a module that can also write a token is the real auth store, and beats
  //     any lookalike that merely exposes a getter
  {
    const page = makePage({
      chunks: makeChunks({
        1: { exports: { getToken: () => 'x'.repeat(60) } },
        2: { exports: { default: { getToken: () => TOKEN, setToken: () => {} } } },
      }),
    });
    const result = inPage(readPageSession, page)(KEYS);
    check('prefers the module that can also write', result.candidates[0].token === TOKEN);
  }

  // 4. a build that moved the token to a key nobody knows yet
  {
    const page = makePage({ local: { XTwS61yOs521gen: JSON.stringify(TOKEN) } });
    const result = inPage(readPageSession, page)(KEYS);
    const [first] = result.candidates;
    check('finds a token under an unknown key', first.probe === 'scan');
    check('names that key', first.key === 'XTwS61yOs521gen');
  }

  // 5. signed out is reported as signed out, with evidence attached
  {
    const page = makePage({
      local: { SelectedGuildStore: '{}' },
      chunks: makeChunks({ 7: { exports: { getToken: () => '', setToken: () => {} } } }),
    });
    const result = inPage(readPageSession, page)(KEYS);
    check('a signed-out tab yields no candidate', result.candidates.length === 0 && result.reason === 'no-session');
    check('the auth module is recorded as present', result.hasTokenFn === true);
    check('storage key names come back for the message', result.storageKeys.includes('SelectedGuildStore'));
  }

  // 5b. a value with a real token's structure is marked as one
  {
    const page = makePage({ local: { token: JSON.stringify(SESSION) } });
    const result = inPage(readPageSession, page)(KEYS);
    check('a session token is recognised structurally', result.candidates[0].strict === true);
  }

  // 5c. a captcha-shaped value is kept as a last resort, never as a session
  {
    const captcha = '0.' + 'A'.repeat(40) + '.' + 'B'.repeat(30);
    const page = makePage({ chunks: makeChunks({ 3: { exports: { getToken: () => captcha } } }) });
    const result = inPage(readPageSession, page)(KEYS);
    check('a lookalike value is still proposed', result.candidates.length === 1);
    check('a captcha is not mistaken for a session', result.candidates[0].strict === false);
  }

  // 5d. the client's own auth store outranks every lookalike
  {
    const page = makePage({
      chunks: makeChunks({
        1: { exports: { getToken: () => SESSION } },
        2: { exports: { default: { getToken: () => OTHER_SESSION, setToken: () => {} } } },
      }),
    });
    const result = inPage(readPageSession, page)(KEYS);
    check('the auth store is proposed first', result.candidates[0].token === OTHER_SESSION);
    check('the lookalike is proposed behind it', result.candidates.length === 2);
  }

  // 5e. ranking across frames: duplicates collapse, structure decides the order
  {
    const session = (candidates) => ({
      candidates,
      reason: 'ok',
      frameUrl: '',
      storageKeys: [],
      hasApp: true,
      hasTokenFn: true,
    });
    const loose = { token: TOKEN, origin: 'memory', key: null, probe: 'memory', strict: false };
    const strict = { token: SESSION, origin: 'localStorage', key: 'token', probe: 'key', strict: true };

    const ranked = rankCandidates([
      session([loose, { ...loose, probe: 'scan', key: 'XTwS61yOs521gen' }]),
      session([strict]),
    ]);
    check('duplicates collapse into one candidate', ranked.length === 2);
    check('a structurally valid value is asked first', ranked[0].token === SESSION);
    check('the best provenance of a duplicate is kept', ranked[1].probe === 'memory');
  }

  // 6. a document that has no storage at all is named, not guessed at
  {
    const page = makePage({});
    page.localStorage = null;
    const result = inPage(readPageSession, page)(KEYS);
    check('names the no-storage case', result.reason === 'no-storage');
  }

  // 7. refused storage is named too — the one case where the app can still win
  {
    const page = makePage({});
    page.localStorage = {
      getItem() { throw new Error('denied'); },
      setItem() {},
      removeItem() {},
    };
    const result = inPage(readPageSession, page)(KEYS);
    check('names the blocked case', result.reason === 'blocked');
  }

  // 8. writing: the quoted form Discord reads, no stale discriminator, and the
  //    client's own token store told about it
  {
    const applied = [];
    const page = makePage({
      local: { token_discriminator: '0' },
      chunks: makeChunks({ 9: { exports: { getToken: () => '', setToken: (v) => applied.push(v) } } }),
    });
    const result = await inPage(installPageSession, page)(KEYS, TOKEN);
    check('writes the quoted form the client parses', page.localStorage[KEY] === JSON.stringify(TOKEN));
    check('clears the stale token discriminator', page.localStorage[DISCRIMINATOR] === undefined);
    check('tells the client token store', result.viaTokenStore === true && applied[0] === TOKEN);
    check('names the document it wrote in', result.url === 'https://discord.com/app');
  }

  // 9. the regression that made login unreliable: Discord publishes the session
  //    it holds in memory while the page unloads, overwriting what we wrote
  {
    let page;
    page = makePage({
      local: { token: JSON.stringify(STALE) },
      onUnload: () => { page.localStorage[KEY] = JSON.stringify(STALE); },
    });
    const result = await inPage(installPageSession, page)(KEYS, TOKEN);
    page.unload();
    check('the unload guard outranks the client handler', page.localStorage[KEY] === JSON.stringify(TOKEN));
    check('the replaced token is reported back', result.previous === JSON.stringify(STALE));
  }

  // 10. signing out clears the value and stays cleared through the same flush
  {
    let page;
    page = makePage({
      local: { token: JSON.stringify(TOKEN), token_discriminator: '0' },
      onUnload: () => { page.localStorage[KEY] = JSON.stringify(TOKEN); },
    });
    const result = await inPage(installPageSession, page)(KEYS, null);
    check('sign-out clears the token', result.cleared === true);
    check('sign-out clears the discriminator', page.localStorage[DISCRIMINATOR] === undefined);
    page.unload();
    check('sign-out survives the client flush', page.localStorage[KEY] === undefined);
  }

  // 11. a page that cannot store anything says so instead of failing quietly
  {
    const page = makePage({});
    page.localStorage = null;
    const result = await inPage(installPageSession, page)(KEYS, TOKEN);
    check('names the no-storage case on write', result.error === 'no-storage');
    check('reports the document it was injected into', result.url === 'https://discord.com/app');
  }

  // 12. storage that refuses the write reports why
  {
    const page = makePage({});
    page.localStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
      removeItem: () => {},
    };
    const result = await inPage(installPageSession, page)(KEYS, TOKEN);
    check('a refused write is reported', result.written === false && result.error === 'quota');
  }

  // 13. storage the browser refuses to hand over is not the same case as a page
  //     that has none: one is fixed in site settings, the other by reloading
  {
    const page = makePage({});
    Object.defineProperty(page, 'localStorage', {
      get() {
        throw new Error('Access is denied for this document.');
      },
      configurable: true,
    });
    const result = await inPage(installPageSession, page)(KEYS, TOKEN);
    check('names the blocked case on write', result.error === 'blocked');
  }

  // 14. when a tab answers frame by frame, the frame that stored the value is
  //     the one whose answer counts. A top frame can be blank — or a wrapper —
  //     with the app in a child, and treating that as "this tab cannot hold a
  //     session" is what made sign-in fail on a perfectly normal Discord tab.
  {
    const at = (url, over) => ({
      url,
      written: false,
      cleared: false,
      previous: null,
      error: null,
      viaTokenStore: false,
      ...over,
    });

    check(
      'a blank top frame yields to the frame that stored it',
      pickWriteOutcome([
        at('about:blank', { error: 'no-storage' }),
        at('https://discord.com/channels/@me', { written: true }),
      ]).url === 'https://discord.com/channels/@me',
    );
    check(
      'the client token store is preferred among writes',
      pickWriteOutcome([
        at('https://discord.com/app', { written: true }),
        at('https://discord.com/channels/@me', { written: true, viaTokenStore: true }),
      ]).viaTokenStore === true,
    );
    check(
      'a cleared answer counts as stored',
      pickWriteOutcome([
        at('about:blank', { error: 'no-storage' }),
        at('https://discord.com/app', { cleared: true }),
      ]).cleared === true,
    );
    check(
      'blocked is reported over no-storage',
      pickWriteOutcome([
        at('about:blank', { error: 'no-storage' }),
        at('https://discord.com/app', { error: 'blocked' }),
      ]).error === 'blocked',
    );
    check('nothing usable reads as null', pickWriteOutcome([null, undefined]) === null);
  }

  return out;
}
`;

/* ------------------------------------------------------------------- main */

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'dtl-page-'));
  const entryFile = join(dir, 'entry.mjs');
  const outFile = join(dir, 'bundle.mjs');
  writeFileSync(entryFile, ENTRY, 'utf8');

  try {
    await esbuild.build({
      entryPoints: [entryFile],
      outfile: outFile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: ['node20'],
      logLevel: 'silent',
    });

    const { run } = await import(pathToFileURL(outFile).href);
    const results = await run();

    let failed = 0;
    for (const [name, passed] of results) {
      if (!passed) failed += 1;
      process.stdout.write(`  ${passed ? 'PASS' : 'FAIL'}  ${name}\n`);
    }

    process.stdout.write(`\n${results.length - failed}/${results.length} checks passed\n`);
    if (failed > 0) process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
