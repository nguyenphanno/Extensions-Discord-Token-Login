/** Pure presentation helpers: identity, time and token formatting. */

import { DISCORD_API_CDN } from '../constants';
import { looksLikeToken } from '../../services/discord-client';

/**
 * Discord stores a 64-bit snowflake; the top 42 bits are a millisecond
 * timestamp offset from the Discord epoch. This is how we show "joined".
 */
const DISCORD_EPOCH_MS = 1_420_070_400_000n;

export function snowflakeToDate(id: string): Date | null {
  if (!/^\d{17,20}$/.test(id)) return null;
  try {
    const ms = (BigInt(id) >> 22n) + DISCORD_EPOCH_MS;
    const date = new Date(Number(ms));
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export function initials(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  if (cleaned.length === 0) return '?';
  const parts = cleaned.split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => [...part][0] ?? '').join('');
  return letters.toUpperCase() || ([...cleaned][0] ?? '?').toUpperCase();
}

/**
 * Deterministic hue from the user id, so a given account always gets the same
 * fallback colour. Matches the technique Discord itself uses for legacy avatars.
 */
export function hashToHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function hslToHex(hue: number, saturation = 62, lightness = 52): string {
  const h = ((hue % 360) + 360) % 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];

  const channel = (value: number): string =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${channel(r ?? 0)}${channel(g ?? 0)}${channel(b ?? 0)}`;
}

/** Prefers the user's paid accent colour, then a stable hue, then blurple. */
export function resolveAccentColor(userId: string, accentColor: number | null): string {
  if (typeof accentColor === 'number' && accentColor > 0) {
    return `#${accentColor.toString(16).padStart(6, '0').slice(-6)}`;
  }
  return hslToHex(hashToHue(userId));
}

/**
 * Builds a CDN avatar URL, upgrading `webp` sources to `png` because Chrome's
 * image pipeline in an extension page handles PNG far more consistently.
 * Animated avatars (hashes prefixed `a_`) keep their GIF.
 */
export function buildAvatarUrl(userId: string, hash: string | null): string | null {
  if (!hash) return null;
  const animated = hash.startsWith('a_');
  const extension = animated ? 'gif' : 'png';
  return `${DISCORD_API_CDN}/avatars/${userId}/${hash}.${extension}?size=160&quality=lossless`;
}

/**
 * Builds the CDN URL for an avatar decoration preset.
 *
 * Decorations live on their own route and are always requested as PNG —
 * Discord serves animated decorations as APNG from the same path, so unlike
 * `buildAvatarUrl` there is no extension to switch. This mirrors discord.js,
 * whose own CDN test asserts the plain `.png` URL.
 */
export function buildAvatarDecorationUrl(asset: string | null): string | null {
  if (asset === null || asset.length === 0) return null;
  return `${DISCORD_API_CDN}/avatar-decoration-presets/${asset}.png`;
}

export function formatRelativeTime(timestamp: number | null, now = Date.now()): string {
  if (timestamp === null) return 'never';
  const delta = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < minute) return 'just now';
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  if (delta < 30 * day) return `${Math.floor(delta / day)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Masks all but the first 4 characters: `abcd••••••••wxyz`. */
export function maskToken(token: string): string {
  if (token.length <= 12) return '•'.repeat(token.length);
  return `${token.slice(0, 4)}${'•'.repeat(12)}${token.slice(-4)}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Parses a plain-text token export into candidate tokens.
 *
 * Tolerates the shapes people actually save: one token per line, comma or
 * whitespace separated, `token:value` pairs, blank lines, and `#` or `//`
 * comments. Values that do not look like Discord tokens are dropped silently,
 * because a file produced by a third-party tool is usually mostly noise around
 * the one value you actually want.
 *
 * Returns candidates in file order, de-duplicated.
 */
export function parseTokenFile(contents: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    // Strip comments before splitting, so a `#` later in a line cannot hide a
    // token that sits before it.
    const line = rawLine.replace(/(?:#|\/\/).*$/, '');
    if (line.trim() === '') continue;

    for (const candidate of line.split(/[\s,;]+/)) {
      // Support `token: <value>` and `token=<value>` exports.
      const value = candidate.replace(/^[A-Za-z_][A-Za-z0-9_]*\s*[:=]\s*/, '');
      if (!looksLikeToken(value)) continue;
      if (seen.has(value)) continue;

      seen.add(value);
      found.push(value);
    }
  }

  return found;
}

/** Decodes a File as UTF-8 text, tolerating a leading byte-order mark. */
export async function readTextFile(file: File, maxBytes = 512 * 1024): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error('That file is too large to be a token list. Pick a smaller .txt file.');
  }
  // A UTF-8 BOM would otherwise become part of the first token and break it.
  return (await file.text()).replace(/^﻿/, '');
}

