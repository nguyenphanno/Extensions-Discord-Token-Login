/**
 * Pure-helper smoke test.
 *
 * `src/core/utils/format.ts` is where identity, time and token-list rendering
 * decisions are made, and every one of them is a place a regression can reach
 * the UI without any type noticing: a CDN URL that renders nothing, a mask
 * that leaks the middle of a token, a snowflake decode that drifts a year.
 *
 * The file has no Chrome and no DOM dependency, so this suite bundles it and
 * exercises the real functions in Node — no fake browser, no mocks.
 *
 * Run with `npm run verify:format`.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src').replace(/\\/g, '/');

const ENTRY = `
import {
  buildAvatarDecorationUrl,
  buildAvatarUrl,
  formatRelativeTime,
  hashToHue,
  initials,
  maskToken,
  parseTokenFile,
  pluralize,
  readTextFile,
  resolveAccentColor,
  snowflakeToDate,
} from '${SRC}/core/utils/format';

const out = [];
const check = (name, passed) => out.push([name, Boolean(passed)]);

const DECORATION_BASE = 'https://cdn.discordapp.com/avatar-decoration-presets';
const AVATAR_BASE = 'https://cdn.discordapp.com/avatars';

export async function run() {
  /* ------------------------------------------------ avatar + decoration */

  check('decoration: null asset -> null', buildAvatarDecorationUrl(null) === null);
  check('decoration: empty asset -> null', buildAvatarDecorationUrl('') === null);
  check(
    'decoration: plain asset -> presets route',
    buildAvatarDecorationUrl('abc123') === DECORATION_BASE + '/abc123.png',
  );
  check(
    // Discord serves animated decorations as APNG from the same .png route
    // (this mirrors discord.js, whose own CDN test asserts the plain .png).
    'decoration: animated asset keeps the presets route',
    buildAvatarDecorationUrl('a_abc123') === DECORATION_BASE + '/a_abc123.png',
  );

  check('avatar: null hash -> null', buildAvatarUrl('123', null) === null);
  check(
    'avatar: static hash -> png at size 160',
    buildAvatarUrl('123', 'abc') === AVATAR_BASE + '/123/abc.png?size=160&quality=lossless',
  );
  check(
    'avatar: animated hash -> gif',
    buildAvatarUrl('123', 'a_abc') === AVATAR_BASE + '/123/a_abc.gif?size=160&quality=lossless',
  );

  /* ------------------------------------------------------------ identity */

  check('initials: two words', initials('kiro nyx') === 'KN');
  check('initials: single word', initials('kiro') === 'K');
  check('initials: symbols degrade to ?', initials('!!!') === '?');

  check(
    'maskToken: middle hidden, ends kept',
    maskToken('abcd1234567890wxyz') === 'abcd' + '\\u2022'.repeat(12) + 'wxyz',
  );
  check('maskToken: short token fully masked', maskToken('short') === '\\u2022'.repeat(5));

  const epoch = snowflakeToDate('80351110224678912');
  check('snowflake: decodes to a 2015 date', epoch !== null && epoch.getUTCFullYear() === 2015);
  check(
    'snowflake: malformed rejected',
    snowflakeToDate('123') === null && snowflakeToDate('not-a-snowflake') === null,
  );

  const hueA = hashToHue('123456789012345678');
  const hueB = hashToHue('123456789012345678');
  check('hashToHue: deterministic and in range', hueA === hueB && hueA >= 0 && hueA < 360);

  check('accent: numeric accent wins', resolveAccentColor('123', 0x5865f2) === '#5865f2');
  check(
    'accent: derived from the id when absent',
    /^#[0-9a-f]{6}$/.test(resolveAccentColor('123', null)) &&
      resolveAccentColor('123', null) === resolveAccentColor('123', null),
  );

  /* -------------------------------------------------------- time + text */

  const now = Date.now();
  check(
    'relative time buckets',
    formatRelativeTime(null) === 'never' &&
      formatRelativeTime(now - 30_000, now) === 'just now' &&
      formatRelativeTime(now - 5 * 60_000, now) === '5m ago' &&
      formatRelativeTime(now - 3 * 3_600_000, now) === '3h ago' &&
      formatRelativeTime(now - 2 * 86_400_000, now) === '2d ago',
  );

  check(
    'pluralize',
    pluralize(1, 'account') === '1 account' &&
      pluralize(2, 'account') === '2 accounts' &&
      pluralize(2, 'person', 'people') === '2 people',
  );

  /* -------------------------------------------------- token list parsing */

  const first = 'M'.repeat(60) + '.YWJjZGVm.0123456789abcdef';
  const second = 'N'.repeat(60) + '.dGVmZ2hp.c2Vjb25kLXZhbHVl';
  const listing = ['# my alts', 'token: ' + first, second + ', ' + first, 'not a token'].join('\\n');

  check(
    'parseTokenFile: comments, labels, separators, dedupe',
    JSON.stringify(parseTokenFile(listing)) === JSON.stringify([first, second]),
  );
  check('parseTokenFile: noise only -> empty', parseTokenFile('just words\\n# nothing').length === 0);

  /* ------------------------------------------------------------- files */

  const bomFile = new File(['\\uFEFFtoken-value'], 'list.txt');
  check('readTextFile: strips the BOM', (await readTextFile(bomFile)) === 'token-value');

  let rejected = false;
  try {
    await readTextFile(new File(['abcdefghij'], 'big.txt'), 5);
  } catch {
    rejected = true;
  }
  check('readTextFile: rejects an oversized file', rejected);

  return out;
}
`;

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'dtl-format-'));
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
