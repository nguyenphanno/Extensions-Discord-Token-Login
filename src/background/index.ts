/**
 * Service worker entry point.
 *
 * MV3 workers are ephemeral: this file is the top-level of every restart. All
 * it does is wire listeners and re-establish in-memory state, so the handlers
 * themselves stay in `router.ts`.
 */

import { createLogger } from '../core/logger';
import type { Request } from '../core/types';
import { vault } from '../crypto/vault';
import { refreshBadgeFromVault } from './badge';
import { onContextMenuClicked, registerContextMenus } from './menu';
import { handleRequest } from './router';

const log = createLogger('worker');

/** Cheap structural check so unrelated runtime messages are ignored. */
function isRequest(message: unknown): message is Request {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as { type?: unknown }).type === 'string'
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isRequest(message)) return false;

  handleRequest(message)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error: unknown) => {
      // `handleRequest` already converts throws into envelopes; reaching here
      // means the router itself failed, which is a genuine bug worth logging.
      log.error('Router crashed', error);
      sendResponse({ ok: false, error: 'The background service hit an unexpected error.' });
    });

  // Keep the message channel open for the async reply.
  return true;
});

chrome.contextMenus.onClicked.addListener((data) => {
  onContextMenuClicked(data);
});

async function bootstrap(reason: string): Promise<void> {
  log.info(`Worker starting (${reason})`);
  await vault.restoreSession().catch((error: unknown) => {
    log.warn('Could not restore the vault session', error);
    return 'locked' as const;
  });
  await refreshBadgeFromVault().catch(() => undefined);
  registerContextMenus();
}

chrome.runtime.onInstalled.addListener((details) => {
  void bootstrap(`installed:${details.reason}`);
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap('startup');
});

// A worker can also be revived purely by an incoming message, with neither
// `onInstalled` nor `onStartup` firing. Boot once at evaluation time.
void bootstrap('evaluate');
