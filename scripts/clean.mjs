/** Removes build output. Used by `npm run clean`. */

import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const target of ['dist']) {
  rmSync(join(ROOT, target), { recursive: true, force: true });
  process.stdout.write(`removed ${target}/\n`);
}
