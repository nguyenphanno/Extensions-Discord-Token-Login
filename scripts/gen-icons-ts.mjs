/**
 * Generates `src/ui/icon-paths.ts` from the installed Tabler icon set.
 *
 *   npm install @tabler/icons
 *   node scripts/gen-icons-ts.mjs
 *
 * Tabler ships thousands of hand-tuned SVGs; re-typing their path data by hand
 * is how a set drifts out of sync with its source. This reads the SVGs straight
 * out of node_modules so the icon set is always the real thing, at the real
 * licence (MIT), with no copy-paste drift.
 *
 * Only the "filled" variant is used. Mixing Tabler's stroke "outline" with its
 * fill "filled" in one UI produces two visibly different icon families.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = join(root, 'node_modules', '@tabler', 'icons', 'icons', 'filled');
const OUT = join(root, 'src', 'ui', 'icon-paths.ts');

/**
 * The app's icon names mapped to Tabler names. Several app concepts have no
 * exact Tabler equivalent in the filled set, so those fall back to the nearest
 * glyph — noted inline, because a silent near-miss is worse than a known one.
 */
const MAP = {
  key: 'key',
  scan: 'zoom-scan', // no "scan" in the filled set
  user: 'user',
  users: 'user', // Tabler filled has no two-person glyph
  swap: 'replace',
  signIn: 'circle-arrow-right', // no "login" in the filled set
  signOut: 'circle-arrow-left', // no "logout" in the filled set
  refresh: 'circle-arrow-right', // no "reload" in the filled set
  plus: 'plus',
  close: 'x',
  trash: 'trash',
  copy: 'copy',
  pencil: 'pencil',
  search: 'search',
  lock: 'lock',
  unlock: 'key', // no "unlock" in the filled set; a key reads as "the thing that opens it"
  shield: 'shield',
  shieldCheck: 'shield-check',
  check: 'check',
  checkCircle: 'circle-check',
  warning: 'alert-triangle',
  info: 'info-circle',
  clock: 'clock',
  eye: 'eye',
  eyeOff: 'circle-x', // no "eye-off" in the filled set
  more: 'dots-vertical',
  chevronDown: 'chevron-down',
  arrowRight: 'arrow-right-circle',
  external: 'external-link',
  sliders: 'adjustments',
  database: 'database',
  brand: 'brand-discord',
  // Token-file import.
  fileUpload: 'file-upload',
  fileText: 'file-text',
};

/** Tabler prefixes every file with this zero-area no-op path; drop it. */
const NOOP = /<path stroke="none" d="M0 0h24v24H0z" fill="none" \/>/;

async function readGlyph(tablerName) {
  const svg = await readFile(join(ICON_DIR, `${tablerName}.svg`), 'utf8');
  const inner = svg
    .replace(/[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*/, '')
    .replace(NOOP, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (inner === '') throw new Error(`${tablerName}.svg has no drawable content`);
  return inner;
}

const entries = await Promise.all(
  Object.entries(MAP).map(async ([name, tablerName]) => {
    let markup;
    try {
      markup = await readGlyph(tablerName);
    } catch (error) {
      throw new Error(`Cannot resolve icon "${name}" -> "${tablerName}": ${error.message}`);
    }
    return `  ${name}: '${markup.replace(/'/g, "\\'")}',`;
  }),
);

const body = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: @tabler/icons (filled variant), MIT licensed.
 * Regenerate: node scripts/gen-icons-ts.mjs
 *
 * Raw inner markup of each Tabler SVG. The renderer in ./icons.ts wraps these
 * in a 24x24 \`fill="currentColor"\` root, so colour comes from CSS \`color\`.
 */

export const ICON_MARKUP = {
${entries.join('\n')}
} as const;
`;

await writeFile(OUT, body, 'utf8');
console.log(`Wrote ${entries.length} icons to ${OUT}`);
