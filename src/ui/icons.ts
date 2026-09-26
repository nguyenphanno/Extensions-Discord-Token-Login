/**
 * Icon renderer.
 *
 * The glyphs themselves are Tabler's *filled* set, pulled straight out of
 * node_modules by `scripts/gen-icons-ts.mjs` — so the artwork is the real,
 * properly-tuned thing rather than a hand-typed approximation that drifts.
 * Tabler is MIT licensed.
 *
 * This module only owns the wrapper: one 24x24 `fill="currentColor"` root per
 * icon, sized in pixels, optionally labelled. Keeping presentation in CSS and
 * geometry in the generator is what lets the set be re-vendored with one
 * command.
 *
 * No emoji, no icon font, no runtime dependency.
 */
import { ICON_MARKUP } from './icon-paths';

const PATHS = ICON_MARKUP;

export type IconName = keyof typeof PATHS;

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface IconOptions {
  /** Pixel size for both axes. Defaults to 20. */
  size?: number;
  /** Extra class on the root `<svg>`. */
  className?: string;
  /**
   * Accessible name. Omit for decorative icons — the surrounding label already
   * carries the meaning, and announcing it twice is noise for screen readers.
   */
  label?: string;
}

const DEFAULT_SIZE = 20;

/** Builds an `<svg>` element for `name`. */
export function icon(name: IconName, options: IconOptions = {}): SVGSVGElement {
  const { size = DEFAULT_SIZE, className, label } = options;
  const svg = document.createElementNS(SVG_NS, 'svg');

  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  // Tabler filled glyphs are solid; colour comes entirely from CSS `color`.
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', label === undefined ? 'true' : 'false');
  svg.classList.add('icon');
  if (className !== undefined) svg.classList.add(className);

  if (label !== undefined) {
    svg.setAttribute('role', 'img');
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = label;
    svg.append(title);
  }

  svg.innerHTML = PATHS[name];
  return svg;
}

/**
 * Replaces an element's children with a fresh icon. Used by the render loop so
 * a redraw can never leave a stale glyph behind.
 */
export function setIcon(host: Element, name: IconName, options: IconOptions = {}): void {
  host.replaceChildren(icon(name, options));
}

/** Markup form, for the few places that build an HTML string. */
export function iconMarkup(name: IconName, options: IconOptions = {}): string {
  return icon(name, options).outerHTML;
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];
