/**
 * Sign-in orchestration smoke test.
 *
 * `page-session-smoke.mjs` proves what the injected function does once it is
 * inside a page. This suite proves the worker's half of the same job: which tab
 * it waits for, which frames it asks, what it says when a frame cannot take the
 * value, and that a tab with nowhere to store the session is reloaded once
 * before the user is asked to do it. The browser API surface is stubbed, so the
 * flow runs in Node with no browser.
 *
 * It exists because the failure it covers was invisible everywhere else: on a
 * perfectly ordinary Discord tab, sign-in reported "not a normal web page",
 * because the value was written into the blank top frame a tab reports
 * `complete` for — or into a top frame that has no storage of its own while the
 * app, and its storage, live in a child frame.
 *
 * Run with `npm run verify:signin`.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src').replace(/\\/g, '/');

/**
 * The suite is bundled and executed, so the browser stand-in has to live inside
 * the generated entry. Only the calls `signIn` makes are implemented, and every
 * one of them is recorded, because "how many frames did it ask, in what order"
 * is exactly what this suite is about.
 */
const ENTRY = `
import { signIn, SignInError } from '${SRC}/services/session-injector';

const out = [];
const check = (name, passed) => out.push([name, Boolean(passed)]);

/** One frame's answer, in the shape the injected function returns. */
const write = (over) => ({
  url: 'https://discord.com/app',
  written: false,
  cleared: false,
  previous: null,
  error: null,
  viaTokenStore: false,
  ...over,
});

/**
 * A browser with one Discord tab in it. \`top\` is what the tab's own frame
 * answers, \`all\` is what every frame answers — including the top one, exactly
 * as Chrome would report it.
 */
function browser(options) {
  const state = { execute: [], reloads: 0, gets: 0 };
  let tab = {
    id: 7,
    active: true,
    status: 'complete',
    url: 'https://discord.com/app',
  };

  globalThis.chrome = {
    tabs: {
      query: async () => [tab],
      get: async () => {
        state.gets += 1;
        const next = (options.answers ?? [])[state.gets - 1];
        if (next !== undefined) tab = { ...tab, ...next };
        return tab;
      },
      update: async () => tab,
      reload: async () => { state.reloads += 1; },
      create: async () => tab,
    },
    windows: { create: async () => ({ id: 1, tabs: [tab] }) },
    scripting: {
      executeScript: async ({ target }) => {
        const scope = target.frameIds !== undefined ? 'top' : 'all';
        state.execute.push(scope);
        // 'afterReload' lets a case answer differently once the recovery reload
        // has happened — the only way to prove the reload itself is what turned
        // a storage-less tab into a signable one.
        const source =
          state.reloads > 0 && options.afterReload !== undefined ? options.afterReload : options;
        const answers = scope === 'top' ? source.top : source.all ?? source.top;
        return (answers ?? []).map((result) => ({ frameId: 0, result }));
      },
    },
  };

  return state;
}

export async function run() {
  const TOKEN = 'A'.repeat(24) + '.' + 'B'.repeat(6) + '.' + 'C'.repeat(32);

  // 1. the ordinary case: the top frame takes the write, and nothing else is asked
  {
    const state = browser({ top: [write({ written: true })] });
    const outcome = await signIn(TOKEN);
    check('signs in through the top frame alone', state.execute.join(',') === 'top');
    check('reloads the tab to activate the session', state.reloads === 1);
    check('reports the tab it used', outcome.tabId === 7 && outcome.reused === true);
  }

  // 2. the regression: the top frame has no storage, the app lives in a child
  {
    const state = browser({
      top: [write({ url: 'about:blank', error: 'no-storage' })],
      all: [
        write({ url: 'about:blank', error: 'no-storage' }),
        write({ url: 'https://discord.com/channels/@me', written: true }),
      ],
    });
    let outcome = null;
    try {
      outcome = await signIn(TOKEN);
    } catch {
      // A throw is the regression; the checks below report it as one.
    }
    check('asks every frame when the top frame has no storage', state.execute.join(',') === 'top,all');
    check('the fallback still signs the tab in', outcome?.tabId === 7 && state.reloads === 1);
  }

  // 3. no frame can store it: the report names the tab and what it showed
  {
    const state = browser({ top: [write({ url: 'about:blank', error: 'no-storage' })] });
    let message = '';
    try {
      await signIn(TOKEN);
    } catch (error) {
      message = error instanceof SignInError ? error.message : 'wrong error';
    }
    check('no storage anywhere is reported as such', message.includes('no page that can hold a session'));
    check('the report names the document it saw', message.includes('about:blank'));
    check('one automatic reload is spent before giving up', state.reloads === 1);
    check('the retry asks the frames again', state.execute.join(',') === 'top,all,top,all');
  }

  // 4. site data switched off is a property of the tab, not of the frame
  {
    const state = browser({ top: [write({ error: 'blocked' })] });
    let message = '';
    try {
      await signIn(TOKEN);
    } catch (error) {
      message = error instanceof SignInError ? error.message : 'wrong error';
    }
    check('a blocked frame is not retried frame by frame', state.execute.join(',') === 'top');
    check('blocked storage names the real fix', message.includes('site data'));
  }

  // 5. a tab still holding about:blank is waited out, not written into
  {
    const state = browser({
      answers: [{ url: 'about:blank' }, { url: 'https://discord.com/app' }],
      top: [write({ written: true })],
    });
    await signIn(TOKEN);
    check('the blank document is waited out', state.gets >= 2 && state.execute.join(',') === 'top');
    check('the write lands once the app has committed', state.reloads === 1);
  }

  // 6. a reload can be what turns a storage-less tab into a signable one
  {
    const state = browser({
      top: [write({ url: 'about:blank', error: 'no-storage' })],
      afterReload: { top: [write({ written: true })] },
    });
    const outcome = await signIn(TOKEN);
    check(
      'the automatic reload lets the write land',
      outcome.tabId === 7 && state.execute.join(',') === 'top,all,top',
    );
    check('a recovered sign-in still reloads to activate', state.reloads === 2);
  }

  return out;
}
`;

/* ------------------------------------------------------------------- main */

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'dtl-signin-'));
  const entryFile = join(dir, 'entry.mjs');
  const outFile = join(dir, 'bundle.mjs');
  writeFileSync(entryFile, ENTRY, 'utf8');

  try {
    await esbuild.build({
      entryPoints: [entryFile],
      outfile: outFile,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
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
