/**
 * Toolbar badge. Shows the number of saved accounts so the user can see at a
 * glance whether the vault has anything in it, without opening the popup.
 */

import { PALETTE } from '../core/constants';
import { createLogger } from '../core/logger';
import { readSettings } from '../platform/settings';

const log = createLogger('badge');

let lastRendered: string | null = null;

export async function refreshBadge(count: number): Promise<void> {
  const settings = await readSettings();
  const text = settings.showBadge && count > 0 ? String(count) : '';

  if (text === lastRendered) return;
  lastRendered = text;

  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: PALETTE.blurple });
  } catch (error) {
    // Chrome throws if the worker is shutting down mid-write. Not worth surfacing.
    log.debug('Badge update skipped', error);
  }
}

export async function refreshBadgeFromVault(): Promise<void> {
  const stored = await chrome.storage.local.get(null);
  const keys = Object.keys(stored).filter((key) => key.startsWith('dtl:rec:'));
  await refreshBadge(keys.length);
}
