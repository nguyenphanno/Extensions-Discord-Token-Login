/**
 * Icon generator.
 *
 * The icon set is resized from the logo at `src/assets/icons/Logo.png` into the
 * sizes Chrome asks for. Drop in any square PNG (this one is 736×736) and run
 * `npm run icons`; the build copies the result straight into `dist/`.
 *
 * Two details are load-bearing:
 *
 *  - Resampling happens in *premultiplied* alpha, with an area-average filter
 *    on the way down and bilinear on the way up. Averaging straight RGBA makes
 *    the colour of a transparent pixel bleed into the one beside it, which is
 *    what turns a logo's edge into a dark halo at 16 px.
 *  - The codec is the project's own (`scripts/lib/png.mjs`). A native image
 *    dependency breaks installs on the platforms people actually use, and
 *    shelling out to an OS tool would make the icon step Windows-only.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng, encodePng } from './lib/png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ICON_DIR = resolve(HERE, '..', 'src', 'assets', 'icons');
const LOGO = resolve(ICON_DIR, 'Logo.png');
const SIZES = [16, 32, 48, 128, 512];

/* --------------------------------------------------------------- resampling */

/**
 * Weights for one destination sample along one axis, as `[sourceIndex, weight]`.
 *
 * Downscaling averages every source pixel the destination sample covers —
 * fractional edges included — which is what keeps a 736→16 step clean instead
 * of aliased. Upscaling falls back to the two nearest samples.
 */
function taps(index, destinationLength, sourceLength) {
  const ratio = sourceLength / destinationLength;

  if (ratio >= 1) {
    const start = index * ratio;
    const end = (index + 1) * ratio;
    const list = [];

    for (
      let source = Math.floor(start);
      source < Math.ceil(end) && source < sourceLength;
      source += 1
    ) {
      const overlap = Math.min(end, source + 1) - Math.max(start, source);
      if (overlap > 0) list.push([source, overlap / ratio]);
    }

    return list;
  }

  const position = (index + 0.5) * ratio - 0.5;
  let lower = Math.floor(position);
  let fraction = position - lower;
  if (lower < 0) {
    lower = 0;
    fraction = 0;
  } else if (lower + 1 >= sourceLength) {
    lower = sourceLength - 1;
    fraction = 0;
  }

  return fraction === 0
    ? [[lower, 1]]
    : [
        [lower, 1 - fraction],
        [lower + 1, fraction],
      ];
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Area/bilinear resample of RGBA pixels, carried out in premultiplied alpha. */
function resample(source, sourceWidth, sourceHeight, width, height) {
  const premultiplied = new Float64Array(sourceWidth * sourceHeight * 4);
  for (let i = 0; i < sourceWidth * sourceHeight; i += 1) {
    const alpha = source[i * 4 + 3] / 255;
    premultiplied[i * 4] = source[i * 4] * alpha;
    premultiplied[i * 4 + 1] = source[i * 4 + 1] * alpha;
    premultiplied[i * 4 + 2] = source[i * 4 + 2] * alpha;
    premultiplied[i * 4 + 3] = source[i * 4 + 3];
  }

  const horizontal = new Float64Array(width * sourceHeight * 4);
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const to = (y * width + x) * 4;
      for (const [sourceX, weight] of taps(x, width, sourceWidth)) {
        const from = (y * sourceWidth + sourceX) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          horizontal[to + channel] += premultiplied[from + channel] * weight;
        }
      }
    }
  }

  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const rows = taps(y, height, sourceHeight);
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;

      for (const [sourceY, weight] of rows) {
        const from = (sourceY * width + x) * 4;
        r += horizontal[from] * weight;
        g += horizontal[from + 1] * weight;
        b += horizontal[from + 2] * weight;
        alpha += horizontal[from + 3] * weight;
      }

      // Anything that rounds to fully transparent is left at zero: undoing the
      // premultiplication below would divide by an alpha nobody can see.
      if (alpha < 0.5) continue;

      const to = (y * width + x) * 4;
      const restore = 255 / alpha;
      out[to] = clampByte(r * restore);
      out[to + 1] = clampByte(g * restore);
      out[to + 2] = clampByte(b * restore);
      out[to + 3] = Math.round(alpha);
    }
  }

  return out;
}

/* ------------------------------------------------------------------ fitting */

/** Centres the logo, scaled to fit, on a transparent square canvas. */
function renderIcon(logo, size) {
  const scale = Math.min(size / logo.width, size / logo.height);
  const fitWidth = Math.max(1, Math.round(logo.width * scale));
  const fitHeight = Math.max(1, Math.round(logo.height * scale));
  const fitted = resample(logo.rgba, logo.width, logo.height, fitWidth, fitHeight);

  const canvas = new Uint8Array(size * size * 4);
  const offsetX = Math.round((size - fitWidth) / 2);
  const offsetY = Math.round((size - fitHeight) / 2);

  for (let y = 0; y < fitHeight; y += 1) {
    const from = y * fitWidth * 4;
    canvas.set(fitted.subarray(from, from + fitWidth * 4), ((y + offsetY) * size + offsetX) * 4);
  }

  return canvas;
}

/* --------------------------------------------------------------------- main */

function main() {
  let logo;
  try {
    logo = decodePng(readFileSync(LOGO));
  } catch (error) {
    throw new Error('Could not read src/assets/icons/Logo.png', { cause: error });
  }

  if (logo.width < Math.max(...SIZES)) {
    process.stdout.write(
      `  note: the logo is ${logo.width}px wide, so icon-${Math.max(...SIZES)} is enlarged.\n`,
    );
  }
  if (logo.width !== logo.height) {
    process.stdout.write(
      `  note: the logo is ${logo.width}×${logo.height}; it is centred, not cropped.\n`,
    );
  }

  mkdirSync(ICON_DIR, { recursive: true });
  process.stdout.write(`  source: Logo.png (${logo.width}×${logo.height})\n`);

  for (const size of SIZES) {
    const encoded = encodePng(size, size, renderIcon(logo, size));

    // Decoding what was just written is the cheapest proof that the file Chrome
    // will load is a valid PNG of the size the manifest claims it is.
    const check = decodePng(encoded);
    if (check.width !== size || check.height !== size) {
      throw new Error(`icon-${size}.png did not survive a round trip; the codec is broken.`);
    }

    writeFileSync(resolve(ICON_DIR, `icon-${size}.png`), encoded);
    process.stdout.write(
      `  icon-${size}.png  ${check.width}×${check.height}  ${(encoded.length / 1024).toFixed(1)} KB\n`,
    );
  }
}

main();
