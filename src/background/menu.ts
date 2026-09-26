/**
 * Right-click menu on the toolbar icon (`contexts: ['action']`).
 *
 * A context menu has no UI of its own, so each item performs its work in the
 * worker and then hands the result to the popup through session storage, which
 * the popup drains on open. That keeps one rendering path for all feedback.
 */

import { CONTEXT_MENU } from '../core/constants';
import { createLogger } from '../core/logger';
import { accountService } from '../services/account-service';
import { extractFromActiveSession } from '../services/token-extractor';

const log = createLogger('menu');

/** Result handed to the popup, which renders it as a toast on open. */
export type Handoff =
  | { kind: 'ready'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'switch'; accountId: string };

const HANDOFF_KEY = 'dtl:handoff';

async function handOff(payload: Handoff): Promise<void> {
  await chrome.storage.session.set({ [HANDOFF_KEY]: payload });
}

/** Read and clear. Returns `null` when the popup was opened normally. */
export async function consumeHandoff(): Promise<Handoff | null> {
  const stored = await chrome.storage.session.get(HANDOFF_KEY);
  const payload = stored[HANDOFF_KEY] as Handoff | undefined;
  if (payload === undefined) return null;
  await chrome.storage.session.remove(HANDOFF_KEY);
  return payload;
}

function label(icon: string, title: string): string {
  return `${icon}   ${title}`;
}

export function registerContextMenus(): void {
  // `removeAll` first: create() throws on a duplicate id, which happens on
  // every worker restart and after a manifest reload.
  void chrome.contextMenus.removeAll().then(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU.ROOT,
      title: 'Discord Token Login',
      contexts: ['action'],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU.QUICK_LOGIN,
      parentId: CONTEXT_MENU.ROOT,
      title: label('\u203A', 'Quick login with a token'),
      contexts: ['action'],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU.EXTRACT,
      parentId: CONTEXT_MENU.ROOT,
      title: label('\u203A', 'Capture token from this Discord session'),
      contexts: ['action'],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU.SEPARATOR,
      parentId: CONTEXT_MENU.ROOT,
      type: 'separator',
      contexts: ['action'],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU.ACCOUNTS,
      parentId: CONTEXT_MENU.ROOT,
      title: label('\u203A', 'Account manager'),
      contexts: ['action'],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU.SETTINGS,
      parentId: CONTEXT_MENU.ROOT,
      title: label('\u203A', 'Settings'),
      contexts: ['action'],
    });

    log.debug('Context menu registered');
  });
}

async function handleQuickLogin(): Promise<void> {
  await handOff({ kind: 'ready', message: 'Paste a token to sign in.' });
}

async function handleExtract(): Promise<void> {
  try {
    const { token } = await extractFromActiveSession();
    const account = await accountService.add(token);
    await handOff({
      kind: 'ready',
      message: `Captured ${account.tag} and saved it to your accounts.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the Discord tab.';
    await handOff({ kind: 'error', message });
  }
}

async function handleAccounts(): Promise<void> {
  const state = await accountService.state();
  if (state.accounts.length === 0) {
    await handOff({ kind: 'ready', message: 'No accounts saved yet.' });
    return;
  }

  // With a single saved account the useful action is unambiguous: sign in as them.
  if (state.accounts.length === 1) {
    await signInFromMenu(state.accounts[0]?.id);
    return;
  }

  await handOff({ kind: 'ready', message: 'Choose an account in the account manager.' });
}

async function signInFromMenu(id: string | undefined): Promise<void> {
  if (id === undefined) return;
  try {
    const account = await accountService.login(id);
    await handOff({ kind: 'ready', message: `Signed in as ${account.tag}.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not sign in.';
    await handOff({ kind: 'error', message });
  }
}

export function onContextMenuClicked(data: chrome.contextMenus.OnClickData): void {
  void (async () => {
    try {
      switch (data.menuItemId) {
        case CONTEXT_MENU.QUICK_LOGIN:
          await handleQuickLogin();
          break;
        case CONTEXT_MENU.EXTRACT:
          await handleExtract();
          break;
        case CONTEXT_MENU.ACCOUNTS: {
          const state = await accountService.state();
          if (state.activeAccountId !== null) {
            await signInFromMenu(state.activeAccountId);
          } else {
            await handleAccounts();
          }
          break;
        }
        case CONTEXT_MENU.SETTINGS:
          await chrome.runtime.openOptionsPage();
          return;
        default:
          return;
      }

      await revealPopup();
    } catch (error) {
      log.error('Context menu action failed', error);
    }
  })();
}

/** `openPopup` is unavailable in older Chrome; the menu is still a no-op there. */
async function revealPopup(): Promise<void> {
  try {
    await chrome.action.openPopup();
  } catch {
    log.debug('Popup could not be opened programmatically; the action was still performed.');
  }
}
