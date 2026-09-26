/**
 * A lightweight popover menu.
 *
 * Used for the per-account overflow. Anchored to the trigger, flipped when it
 * would leave the popup bounds, and dismissed on Escape, an outside click, or
 * any scroll — the three ways a user expects a menu to go away.
 */

import { el, on } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';

export interface MenuItem {
  label: string;
  icon?: IconName;
  tone?: 'default' | 'danger';
  onSelect: () => void | Promise<void>;
}

export interface MenuSeparator {
  separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

const MARGIN = 6;

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'separator' in entry;
}

/** Opens a menu anchored to `anchor`. Returns a disposer. */
export function openMenu(anchor: HTMLElement, entries: MenuEntry[]): () => void {
  const menu = el('div', { class: 'menu', role: 'menu' });

  for (const entry of entries) {
    if (isSeparator(entry)) {
      menu.append(el('div', { class: 'menu__sep', role: 'separator' }));
      continue;
    }

    const item = el(
      'button',
      {
        class: `menu__item${entry.tone === 'danger' ? ' menu__item--danger' : ''}`,
        type: 'button',
        role: 'menuitem',
      },
      [
        entry.icon === undefined ? null : icon(entry.icon, { size: 18 }),
        document.createTextNode(entry.label),
      ],
    );

    on(item, 'click', () => {
      dispose();
      void entry.onSelect();
    });

    menu.append(item);
  }

  document.body.append(menu);
  position(menu, anchor);

  const first = menu.querySelector<HTMLElement>('.menu__item');
  first?.focus();

  function onPointerDown(event: PointerEvent): void {
    if (event.target instanceof Node && !menu.contains(event.target) && event.target !== anchor) {
      dispose();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispose();
      anchor.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const items = Array.from(menu.querySelectorAll<HTMLElement>('.menu__item'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = items[(index + step + items.length) % items.length];
    next?.focus();
  }

  function onScroll(): void {
    dispose();
  }

  function dispose(): void {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    menu.remove();
  }

  // `capture` so we see the click before the anchor's own handler re-opens us.
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);

  return dispose;
}

/** Places the menu below the anchor, flipping up or clamping when it will not fit. */
function position(menu: HTMLElement, anchor: HTMLElement): void {
  const anchorBox = anchor.getBoundingClientRect();
  const menuBox = menu.getBoundingClientRect();
  const viewport = window.innerHeight;

  const below = anchorBox.bottom + MARGIN;
  const fitsBelow = below + menuBox.height + MARGIN <= viewport;
  const top = fitsBelow ? below : Math.max(MARGIN, anchorBox.top - menuBox.height - MARGIN);

  const left = Math.min(
    Math.max(MARGIN, anchorBox.right - menuBox.width),
    window.innerWidth - menuBox.width - MARGIN,
  );

  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
}
