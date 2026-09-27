/**
 * Renders every icon in the set to a standalone contact sheet.
 *
 *   node scripts/icon-sheet.mjs
 *   -> icon-sheet.html
 *
 * Eyeballing 28 glyphs by reloading the extension each time is a slow loop, and
 * optical weight problems only show up when the icons sit next to each other.
 * This writes one page that shows all of them, on both themes, at every size
 * the app actually uses.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Sizes the UI actually renders, so the sheet catches size-specific breakage. */
const SIZES = [14, 16, 18, 20, 24, 32];

async function loadMarkup() {
  // icon-paths.ts is TypeScript and DOM-free — a neutral build is safe to
  // import straight into Node.
  const out = await build({
    entryPoints: [join(root, 'src/ui/icon-paths.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    target: 'es2022',
  });

  const code = out.outputFiles[0].text;
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
  return module.ICON_MARKUP;
}

const ICON_MARKUP = await loadMarkup();
const names = Object.keys(ICON_MARKUP);

const cell = (name, markup, size) => `
  <figure>
    <span class="glyph" style="width:${size}px;height:${size}px">${markup}</span>
    <figcaption>${size}</figcaption>
  </figure>`;

const row = (name, markup) => `
  <tr>
    <th scope="row">${name}</th>
    ${SIZES.map((s) => `<td>${cell(name, markup, s)}</td>`).join('')}
  </tr>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Icon contact sheet — Discord Token Login</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    padding: 32px;
    font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
    background: #1e1f22;
    color: #f2f3f5;
  }
  h1 { font-size: 17px; margin: 0 0 4px; }
  p.lede { margin: 0 0 28px; color: #b5bac1; max-width: 62ch; }
  table { border-collapse: collapse; width: 100%; }
  th, td {
    text-align: center;
    padding: 10px 8px;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  th[scope=row] {
    text-align: left;
    font-weight: 500;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: #b5bac1;
    white-space: nowrap;
  }
  thead th { color: #8e9297; font-weight: 600; font-size: 11px; }
  figure { margin: 0; display: grid; gap: 5px; justify-items: center; }
  .glyph { display: grid; place-items: center; color: #f2f3f5; }
  .glyph svg { display: block; }
  figcaption { font-size: 10px; color: #6d6f78; }
  tbody tr:hover { background: rgba(255,255,255,.035); }
  .light { background: #ffffff; color: #1e1f22; }
  .light .glyph { color: #1e1f22; }
  section { margin-bottom: 36px; }
  section > h2 { font-size: 13px; margin: 0 0 10px; color: #b5bac1; font-weight: 600; }
</style>
</head>
<body>
  <h1>Icon contact sheet</h1>
  <p class="lede">
    ${names.length} glyphs from the Tabler filled set (MIT). Scanned left to right at the
    sizes the app renders. Weight should look even down each column; a glyph that reads darker
    or lighter than its neighbours is the one to adjust.
  </p>

  <section>
    <h2>Dark surface (the app's default)</h2>
    <table>
      <thead><tr><th scope="col">icon</th>${SIZES.map((s) => `<th scope="col">${s}px</th>`).join('')}</tr></thead>
      <tbody>${names.map((n) => row(n, ICON_MARKUP[n])).join('')}</tbody>
    </table>
  </section>

  <section class="light">
    <h2>Light surface (contrast check)</h2>
    <table>
      <thead><tr><th scope="col">icon</th>${SIZES.map((s) => `<th scope="col">${s}px</th>`).join('')}</tr></thead>
      <tbody>${names.map((n) => row(n, ICON_MARKUP[n])).join('')}</tbody>
    </table>
  </section>
</body>
</html>`;

const out = join(root, 'icon-sheet.html');
await writeFile(out, html, 'utf8');
console.log(`Wrote ${names.length} icons to ${out}`);
