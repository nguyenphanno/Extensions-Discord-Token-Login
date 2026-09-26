/**
 * Typed bridge between the UI surfaces (popup, options) and the service worker.
 *
 * The UI never touches `chrome.storage` or the vault directly — every read and
 * write is a message, which keeps the lock check in exactly one place and means
 * a compromised page context has no path to the key.
 */

import { createLogger } from '../core/logger';
import type { AppState, Request, Result } from '../core/types';

const log = createLogger('rpc');

export class RpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RpcError';
  }
}

/** Sends a request and unwraps the `{ ok }` envelope into a value or a throw. */
export async function call<T>(request: Request): Promise<T> {
  let raw: unknown;
  try {
    raw = await chrome.runtime.sendMessage(request);
  } catch (error) {
    // The worker can be torn down between the click and the send; that is a
    // normal condition, not a failure worth alarming the user about.
    log.warn('sendMessage failed', error);
    throw new RpcError('The background service is not responding. Try again.');
  }

  if (raw === undefined) {
    throw new RpcError('The background service did not reply. Try again.');
  }

  const envelope = raw as Result<T>;
  if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
    if (envelope.ok) return envelope.data;
    throw new RpcError(envelope.error);
  }

  throw new RpcError('Received an unexpected response from the background service.');
}

/**
 * Subscribes to worker-pushed state snapshots. Returns an unsubscribe function
 * so a view can scope the listener to its own lifetime.
 */
export function onStateChange(handler: (state: AppState) => void): () => void {
  const listener = (message: unknown): void => {
    const record = message as { kind?: string; state?: AppState };
    if (record?.kind !== 'state-changed' || record.state === undefined) return;
    handler(record.state);
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

/** Opens the options page in a real tab. */
export async function openOptions(): Promise<void> {
  await chrome.runtime.openOptionsPage();
}
