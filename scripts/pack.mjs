/**
 * Release packager. Wraps the built `dist/` directory into the archive Chrome
 * Web Store expects: `manifest.json` at the archive root, no parent folder.
 *
 * Uses the platform's own tool — `Compress-Archive` on Windows, `zip`
 * everywhere else — which keeps the project's zero-dependency policy intact:
 * no archiver library and no transitive tree to audit for a script that ships
 * nothing at runtime.
 *
 * Run with `npm run pack` (which builds first) or `node scripts/pack.mjs`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const zipPath = join(ROOT, `${pkg.name}-${pkg.version}.zip`);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (!existsSync(join(DIST, 'manifest.json'))) {
  fail('dist/ has no manifest — run `npm run build` first (or use `npm run pack`).');
}

// Overwrite rather than fail: repacking after a rebuild is the normal path.
rmSync(zipPath, { force: true });

const result =
  process.platform === 'win32'
    ? spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Compress-Archive -Path '${join(DIST, '*')}' -DestinationPath '${zipPath}' -Force`,
        ],
        { stdio: 'inherit' },
      )
    : spawnSync('zip', ['-r', '-q', zipPath, '.'], { cwd: DIST, stdio: 'inherit' });

if (result.error !== undefined) {
  fail(
    process.platform === 'win32'
      ? `Could not launch PowerShell to create the archive: ${result.error.message}`
      : `Could not launch \`zip\` — install it (e.g. \`apt install zip\`) and try again: ${result.error.message}`,
  );
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const size = statSync(zipPath).size;
const human =
  size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(2)} MB`;
process.stdout.write(`\nPacked ${pkg.name}@${pkg.version} -> ${zipPath} (${human})\n`);
