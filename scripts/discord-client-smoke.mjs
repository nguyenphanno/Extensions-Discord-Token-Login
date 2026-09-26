/**
 * API-client smoke test.
 *
 * The one module that touches the wire is also the one an entire class of bug
 * hides in: a request can carry a perfectly good token and still be rejected,
 * because the *header* is wrong. That is exactly what happened — every
 * validation came back `401 Unauthorized` while nothing about the token was at
 * fault: the credential was being sent as `Token <token>`, a scheme Discord
 * does not define (`Bot ` and `Bearer ` are the only ones, and a user token is
 * sent bare).
 *
 * No other gate can see that. `tsc` is happy, the bundle builds, and every
 * injected-page check still passes, because none of them make a request. So
 * this suite stubs `fetch`, drives the real client code, and asserts on the
 * bytes it was about to send.
 *
 * Run with `npm run verify:api`.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src').replace(/\\/g, '/');

/**
 * The suite is bundled and executed, so the `fetch` stand-in has to live inside
 * the generated entry. It records every request it is given and answers with
 * whatever the current case asks for; `Response` and `fetch` are Node globals,
 * which is what the client itself resolves against.
 */
const ENTRY = `
import { fetchCurrentUser, checkToken, looksLikeToken, DiscordApiError } from '${SRC}/services/discord-client';

const ID = '123456789012345678';
/** A structurally real token: base64 id, then the two shorter segments. */
const TOKEN = Buffer.from(ID).toString('base64') + '.' + 'A'.repeat(6) + '.' + 'B'.repeat(32);

const USER = {
  id: ID,
  username: 'kiro',
  global_name: null,
  discriminator: '0',
  avatar: null,
  accent_color: null,
};

const out = [];
const check = (name, passed) => out.push([name, Boolean(passed)]);

/** Captures requests and answers with the response the case provides. */
function intercept(respond) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return respond(calls.length);
  };
  return calls;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function run() {
  // 1. the regression behind the 401s: a user token is sent with no scheme
  {
    const calls = intercept(() => json(USER));
    await fetchCurrentUser(TOKEN);
    const headers = calls[0]?.init?.headers ?? {};
    const sent = String(headers.Authorization);

    check('sends the token itself, with no scheme', sent === TOKEN);
    check('no Token/Bot/Bearer prefix rides along', !/^(?:Token|Bot|Bearer)\\s/i.test(sent));
    check('sends no surrounding whitespace at all', !/\\s/.test(sent));
    check('declares the JSON accept header', headers.Accept === 'application/json');
    check('sends no dead User-Agent header', !('User-Agent' in headers));
    check('sends no empty X-Super-Properties header', !('X-Super-Properties' in headers));
    check(
      'targets /users/@me on the documented base',
      calls[0]?.url === 'https://discord.com/api/v9/users/@me' && calls[0]?.init?.method === 'GET',
    );
  }

  // 2. a token pasted with stray whitespace is still sent clean
  {
    const calls = intercept(() => json(USER));
    await fetchCurrentUser('  ' + TOKEN + '\\n');
    check('trims a padded paste before it hits the wire', calls[0]?.init?.headers?.Authorization === TOKEN);
  }

  // 3. prose is refused locally — a malformed paste costs no request
  {
    const calls = intercept(() => json(USER));
    let status = null;
    try {
      await fetchCurrentUser('that is not a token');
    } catch (error) {
      status = error instanceof DiscordApiError ? error.status : 'wrong-error';
    }
    check('prose is refused before the request', status === 0);
    check('the refusal costs no request', calls.length === 0);
    check('a real token passes the structural screen', looksLikeToken(TOKEN) === true);
  }

  // 4. a 200 becomes a valid account
  {
    intercept(() => json(USER));
    const result = await checkToken(TOKEN);
    check('a 200 is reported as valid', result.valid === true && result.status === 'valid');
    check('the profile comes back with it', result.user?.id === ID && result.user?.username === 'kiro');
  }

  // 5. a 401 becomes an expired account, reported once and never retried
  {
    const calls = intercept(() => json({ message: '401: Unauthorized', code: 0 }, 401));
    const result = await checkToken(TOKEN);
    check('a 401 becomes an expired account', result.valid === false && result.status === 'expired');
    check('the rejection explains itself', result.message.includes('rejected'));
    check('a 401 is not retried', calls.length === 1);
  }

  // 6. a 429 is the one status that is retried, and the retry is honoured
  {
    let attempt = 0;
    const calls = intercept(() => (++attempt === 1 ? json({ message: 'You are being rate limited.' }, 429) : json(USER)));
    const result = await checkToken(TOKEN);
    check('a 429 is retried', calls.length === 2);
    check('the retry is honoured', result.valid === true);
  }

  return out;
}
`;

/* ------------------------------------------------------------------- main */

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'dtl-api-'));
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
