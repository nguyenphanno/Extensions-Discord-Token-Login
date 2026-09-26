/**
 * One row in the account list.
 *
 * Identity on the left, one primary action and one overflow menu on the right,
 * metadata in between. Rows are rebuilt from state on every render rather than
 * diffed — the list is short, and a full rebuild removes an entire class of
 * stale-DOM bugs.
 */

import type { Account, AccountStatus } from '../core/types';
import { formatRelativeTime, initials, pluralize } from '../core/utils/format';
import { el } from '../ui/dom';
import { icon } from '../ui/icons';

/** How a status is worded in the UI. Never expose the raw enum value. */
const STATUS_COPY: Record<AccountStatus, { label: string; className: string } | null> = {
  valid: null,
  unknown: { label: 'Not checked', className: 'pill' },
  expired: { label: 'Expired', className: 'pill pill--danger' },
  locked: { label: 'Locked', className: 'pill pill--warning' },
  error: { label: 'Unreachable', className: 'pill' },
};

export interface AccountRowOptions {
  account: Account;
  isActive: boolean;
  /** 1-based position, used for the accessible row label. */
  index: number;
  total: number;
}

export function accountRow(options: AccountRowOptions): HTMLLIElement {
  const { account, isActive, index, total } = options;

  const status = STATUS_COPY[account.status];
  const lastUsed = account.lastUsedAt === null ? 'never used' : `used ${formatRelativeTime(account.lastUsedAt)}`;

  const meta = el('span', { class: 'account__meta' }, [
    el('span', { class: 'account__tag', text: account.tag }),
    el('span', { class: 'account__dot', 'aria-hidden': 'true' }),
    el('span', { text: lastUsed }),
  ]);

  if (status !== null) {
    meta.append(
      el('span', { class: 'account__dot', 'aria-hidden': 'true' }),
      el('span', { class: status.className, text: status.label }),
    );
  }

  const body = el('span', { class: 'account__body' }, [
    el('span', { class: 'account__name' }, [
      el('span', { class: 'account__name-text', text: account.displayName }),
      isActive ? el('span', { class: 'pill pill--brand', text: 'Active' }) : null,
    ]),
    meta,
  ]);

  if (account.note.length > 0) {
    body.title = account.note;
    meta.append(
      el('span', { class: 'account__dot', 'aria-hidden': 'true' }),
      el('span', { class: 'pill pill--brand', text: `📝 ${account.note.length > 16 ? account.note.slice(0, 16) + '…' : account.note}` }),
    );
  }

  const row = el(
    'li',
    {
      class: `account${isActive ? ' account--active' : ''}`,
      'data-account': account.id,
      'aria-label': `${account.displayName}, ${account.tag}, ${lastUsed}, row ${index} of ${total}`,
    },
    [avatar(account, isActive), body, actions(account, isActive)],
  );

  return row;
}

function avatar(account: Account, isActive: boolean): HTMLElement {
  const node = el('span', { class: `avatar avatar--md${isActive ? ' avatar--active-ring' : ''}` });

  if (account.avatarUrl !== null) {
    const image = el('img', {
      src: account.avatarUrl,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
    });

    // A CDN hiccup should fall back to initials, not a broken-image glyph.
    image.addEventListener('error', () => {
      image.remove();
      node.textContent = initials(account.displayName);
      node.style.backgroundColor = account.accentColor;
    });

    node.append(image);
  } else {
    node.textContent = initials(account.displayName);
    node.style.backgroundColor = account.accentColor;
  }

  node.append(el('span', { class: `avatar__status avatar__status--${account.status}` }));

  // Discord draws decorations on top of the avatar and slightly beyond its
  // bounds, so they need a wrapper that may overflow — the avatar itself
  // clips its own image to a circle.
  if (account.avatarDecorationUrl) {
    const decoration = el('img', {
      class: 'avatar__decoration',
      src: account.avatarDecorationUrl,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
    });

    // A decoration the CDN no longer serves should leave the avatar alone.
    decoration.addEventListener('error', () => decoration.remove());
    return el('span', { class: 'avatar-decorated' }, [node, decoration]);
  }

  return node;
}

function actions(account: Account, isActive: boolean): HTMLElement {
  const signIn = el(
    'button',
    {
      class: 'btn btn--primary btn--sm account__signin',
      type: 'button',
      'data-action': 'sign-in',
      'data-id': account.id,
    },
    [icon('signIn', { size: 18 }), document.createTextNode('Sign in')],
  );

  const overflow = el(
    'button',
    {
      class: 'btn btn--icon',
      type: 'button',
      'data-action': 'menu',
      'data-id': account.id,
      title: `More actions for ${account.displayName}`,
    },
    [icon('more', { size: 20 })],
  );
  overflow.append(el('span', { class: 'visually-hidden', text: `More actions for ${account.displayName}` }));

  return el('span', { class: 'account__actions' }, [
    isActive ? null : signIn,
    overflow,
  ]);
}

/** Lede copy under the "Your accounts" heading. */
export function accountsLede(accounts: Account[]): string {
  if (accounts.length === 0) return 'Nothing saved yet.';

  const healthy = accounts.filter(
    (account) => account.status === 'valid' || account.status === 'unknown',
  ).length;
  const total = pluralize(accounts.length, 'account');

  if (healthy === accounts.length) return `${total} · all tokens responding`;
  return `${total} · ${healthy} of ${accounts.length} responding`;
}
