/**
 * Minimal PNG codec.
 *
 * Chrome will not accept SVG for extension icons, so the build has to produce
 * real raster files. Rather than pull in a native image dependency — which
 * breaks installs on the platforms people actually use — this writes the four
 * chunks Chrome cares about directly, using Node's built-in zlib.
 *
 * The decoder exists for the same reason, one step earlier in the pipeline: the
 * icon set is resized from a logo file, and reading one should not drag a native
 * image library into the toolchain either. It covers the subset an exported logo
 * actually uses; the exact scope is stated at `decodePng`.
 */

import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

/**
 * Encodes 8-bit RGBA pixels as a PNG.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba  `width * height * 4` bytes.
 * @returns {Buffer}
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} bytes of RGBA, received ${rgba.length}`);
  }

  // Each scanline is prefixed with its filter type. Filter 0 (None) keeps this
  // simple; the files are tiny and zlib still compresses the flat regions well.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- decoding */

/** Channels per pixel, keyed by the `IHDR` colour type. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Multiplier that brings a sample of the given depth into 0–255. */
const DEPTH_SCALE = { 1: 255, 2: 85, 4: 17, 8: 1 };

function paeth(left, above, aboveLeft) {
  const estimate = left + above - aboveLeft;
  const toLeft = Math.abs(estimate - left);
  const toAbove = Math.abs(estimate - above);
  const toAboveLeft = Math.abs(estimate - aboveLeft);
  if (toLeft <= toAbove && toLeft <= toAboveLeft) return left;
  return toAbove <= toAboveLeft ? above : aboveLeft;
}

/**
 * Reverses the per-row prediction filters. This is byte-level work whatever the
 * colour type or bit depth is, which is why it happens before any unpacking.
 */
function unfilter(flat, height, stride, bpp) {
  const out = new Uint8Array(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = flat[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    const up = to - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = flat[from + x];
      const left = x >= bpp ? out[to + x - bpp] : 0;
      const above = y > 0 ? out[up + x] : 0;
      const aboveLeft = y > 0 && x >= bpp ? out[up + x - bpp] : 0;

      let value;
      switch (filter) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + left;
          break;
        case 2:
          value = raw + above;
          break;
        case 3:
          value = raw + ((left + above) >> 1);
          break;
        case 4:
          value = raw + paeth(left, above, aboveLeft);
          break;
        default:
          throw new Error(`Unknown PNG filter type ${filter} on row ${y}.`);
      }

      out[to + x] = value & 0xff;
    }
  }

  return out;
}

/**
 * Decodes a PNG into 8-bit RGBA.
 *
 * The supported subset is the one an exported logo actually uses: greyscale,
 * truecolour, palette and the two alpha variants, at 1, 2, 4, 8 or 16 bits per
 * sample, with every filter type and an optional `tRNS` chunk. Adam7
 * interlacing is the one thing refused by name — decoding it wrongly would show
 * up as a scrambled icon, and re-saving without it is a checkbox in any editor.
 *
 * Chunk CRCs are not verified: the file is local, and zlib already fails loudly
 * on a truncated one.
 *
 * @param {Buffer} file
 * @returns {{ width: number, height: number, rgba: Uint8Array }}
 */
export function decodePng(file) {
  if (!file.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('That file is not a PNG.');
  }

  let header = null;
  let palette = null;
  let transparency = null;
  const parts = [];

  for (let offset = 8; offset + 8 <= file.length;) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colour: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      transparency = Buffer.from(data);
    } else if (type === 'IDAT') {
      parts.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (header === null) throw new Error('That PNG has no IHDR chunk.');
  if (header.interlace !== 0) {
    throw new Error('That PNG is interlaced; re-save it without interlacing and try again.');
  }
  if (parts.length === 0) throw new Error('That PNG carries no pixel data.');

  const { width, height, depth, colour } = header;
  const channels = CHANNELS[colour];
  if (channels === undefined) throw new Error(`Unsupported PNG colour type ${colour}.`);
  if (DEPTH_SCALE[depth] === undefined && depth !== 16) {
    throw new Error(`Unsupported PNG bit depth ${depth}.`);
  }
  if (colour === 3 && palette === null) {
    throw new Error('That PNG is palette-based but carries no palette.');
  }

  const bits = channels * depth;
  const bpp = Math.max(1, Math.ceil(bits / 8));
  const stride = Math.ceil((width * bits) / 8);
  const rows = unfilter(zlib.inflateSync(Buffer.concat(parts)), height, stride, bpp);

  // Palette and greyscale images may pack several samples into one byte; going
  // through this reader keeps bit depth out of the pixel loop below.
  const sample = (row, index) => {
    if (depth === 8) return row[index];
    if (depth === 16) return (row[index * 2] << 8) | row[index * 2 + 1];
    const perByte = 8 / depth;
    const byte = row[Math.floor(index / perByte)];
    const shift = 8 - depth * ((index % perByte) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };

  const toByte = (value) => (depth === 16 ? value >> 8 : value * DEPTH_SCALE[depth]);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const row = rows.subarray(y * stride, (y + 1) * stride);

    for (let x = 0; x < width; x += 1) {
      const to = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;

      if (colour === 3) {
        const index = Math.min(sample(row, x), palette.length / 3 - 1);
        r = palette[index * 3];
        g = palette[index * 3 + 1];
        b = palette[index * 3 + 2];
        if (transparency !== null && index < transparency.length) a = transparency[index];
      } else if (colour === 0 || colour === 4) {
        const grey = sample(row, x * channels);
        r = g = b = toByte(grey);
        if (colour === 4) a = toByte(sample(row, x * channels + 1));
        else if (transparency !== null && grey === transparency.readUInt16BE(0)) a = 0;
      } else {
        r = toByte(sample(row, x * channels));
        g = toByte(sample(row, x * channels + 1));
        b = toByte(sample(row, x * channels + 2));
        if (colour === 6) {
          a = toByte(sample(row, x * channels + 3));
        } else if (transparency !== null) {
          const key =
            sample(row, x * channels) === transparency.readUInt16BE(0) &&
            sample(row, x * channels + 1) === transparency.readUInt16BE(2) &&
            sample(row, x * channels + 2) === transparency.readUInt16BE(4);
          if (key) a = 0;
        }
      }

      rgba[to] = r;
      rgba[to + 1] = g;
      rgba[to + 2] = b;
      rgba[to + 3] = a;
    }
  }

  return { width, height, rgba };
}
