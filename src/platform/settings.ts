/**
 * Plaintext preference storage.
 *
 * Deliberately separate from the vault: these values are not secrets, they are
 * UI preferences and the active-account pointer, and reading them must never
 * require a key.
 */

import { STORAGE } from '../core/constants';
import type { Settings } from '../core/types';

export const DEFAULT_SETTINGS: Settings = {
  activeAccountId: null,
  focusTokenOnOpen: true,
  clearTokenAfterLogin: true,
  revealToken: false,
  openInNewWindow: false,
  showBadge: true,
};

export async function readSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE.SETTINGS);
  const raw = stored[STORAGE.SETTINGS] as Partial<Settings> | undefined;
  if (raw === undefined) return { ...DEFAULT_SETTINGS };

  // Merge field-by-field so a settings key added in a later version simply
  // picks up its default instead of coming back `undefined`.
  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = raw[key];
    if (value !== undefined && typeof value === typeof DEFAULT_SETTINGS[key]) {
      // The cast is safe: every Settings field is a primitive.
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await readSettings();
  const next: Settings = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE.SETTINGS]: next });
  return next;
}

export async function resetSettings(): Promise<Settings> {
  await chrome.storage.local.remove(STORAGE.SETTINGS);
  return { ...DEFAULT_SETTINGS };
}
