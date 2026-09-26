/**
 * README link check.
 *
 * The five READMEs are the public face of the project and reference files by
 * relative path — screenshots, the license, `tsconfig.json`, the other
 * translations. A renamed or deleted file leaves a broken link behind that
 * nothing else would catch, so every relative target is resolved against the
 * repository root and must exist.
 *
 * Two shapes have to be scanned, because the READMEs use both: markdown links
 * (`[text](target)` — including nested badge links) and raw HTML attributes
 * (`<a href="…">`, `<img src="…">`). Absolute URLs, bare anchors and
 * `mailto:` links are skipped: they do not point inside this repository.
 *
 * Run with `npm run verify:docs`.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Schemes (`https:`, `mailto:`) and bare anchors (`#section`) live elsewhere. */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|#)/i;

/**
 * The text after any `](`, which is what a markdown target always is. Written
 * without a leading bracket so a nested `[![badge](img)](target)` still yields
 * both the inner image and the outer link.
 */
const MARKDOWN = /\]\(\s*([^)\s]+)/g;

/** `href="…"` / `src="…"` inside the HTML blocks the READMEs are built from. */
const HTML = /(?:href|src)\s*=\s*"([^"]+)"/g;

const out = [];
const check = (name, passed) => out.push([name, Boolean(passed)]);

/** The five READMEs, discovered rather than hard-coded so they cannot drift. */
const readmes = readdirSync(ROOT)
  .filter((name) => /^README(?:_[A-Z]{2})?\.md$/.test(name))
  .sort();

/** Decodes a percent-encoded path without ever throwing on malformed input. */
function decode(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Every in-repository target a markdown file points at, in document order. */
function relativeTargets(markdown) {
  const targets = new Set();

  for (const pattern of [MARKDOWN, HTML]) {
    for (const match of markdown.matchAll(pattern)) {
      const raw = match[1];
      if (raw === undefined || raw.length === 0 || EXTERNAL.test(raw)) continue;

      // `file.png#anchor` and `page.md?query` both resolve to the path alone.
      const path = decode(raw.split('#')[0]?.split('?')[0] ?? '');
      if (path.length > 0) targets.add(path);
    }
  }

  return [...targets];
}

function main() {
  check('five READMEs found', readmes.length === 5);

  for (const file of readmes) {
    const targets = relativeTargets(readFileSync(join(ROOT, file), 'utf8'));
    const missing = targets.filter((target) => !existsSync(join(ROOT, target)));

    check(`${file}: ${targets.length} relative links resolve`, missing.length === 0);
    for (const target of missing) process.stdout.write(`    missing -> ${target}\n`);
  }

  let failed = 0;
  for (const [name, passed] of out) {
    if (!passed) failed += 1;
    process.stdout.write(`  ${passed ? 'PASS' : 'FAIL'}  ${name}\n`);
  }

  process.stdout.write(`\n${out.length - failed}/${out.length} checks passed\n`);
  if (failed > 0) process.exit(1);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
}
