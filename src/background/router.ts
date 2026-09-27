/**
 * Request router. The single entry point for anything the UI can ask for.
 *
 * Two invariants:
 *  - handlers never throw; a failure comes back as `{ ok: false, error }` so
 *    the popup can always render something useful
 *  - any mutation broadcasts a fresh snapshot to every open surface
 */

import { createLogger } from '../core/logger';
import type { Request, Response, Result } from '../core/types';
import { vault, VaultAuthError, VaultLockedError } from '../crypto/vault';
import { readSettings, writeSettings } from '../platform/settings';
import { accountService } from '../services/account-service';
import { extractFromActiveSession } from '../services/token-extractor';
import { refreshBadgeFromVault } from './badge';

const log = createLogger('router');

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

function fail(error: unknown): Result<never> {
  if (error instanceof VaultAuthError) return { ok: false, error: error.message, code: 'auth' };
  if (error instanceof VaultLockedError) {
    return { ok: false, error: 'Unlock your vault to continue.', code: 'locked' };
  }
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  log.error('Request failed', error);
  return { ok: false, error: message };
}

/** Pushes a fresh snapshot to any open popup/options page. */
async function broadcast(): Promise<void> {
  try {
    const state = await accountService.state();
    await chrome.runtime.sendMessage({ kind: 'state-changed', state }).catch(() => undefined);
    await refreshBadgeFromVault();
  } catch (error) {
    // A locked vault simply has no snapshot to broadcast.
    log.debug('Broadcast skipped', error);
  }
}

/**
 * Requests that never change stored state, so a snapshot broadcast after them
 * would only repeat work. Everything else — including lock and unlock, which
 * change `state.lock` — broadcasts; a request type added later is broadcast
 * too, which is the safer default.
 */
const READ_ONLY: ReadonlySet<Request['type']> = new Set([
  'state/get',
  'token/extract',
  'token/validate',
]);

export async function handleRequest(request: Request): Promise<Response> {
  try {
    switch (request.type) {
      case 'state/get':
        return ok(await accountService.state());

      case 'account/add':
        return ok(await accountService.add(request.token, request.note ?? ''));

      case 'account/remove':
        await accountService.remove(request.id);
        return ok(null);

      case 'account/update':
        return ok(await accountService.update(request.id, request.patch));

      case 'account/validate':
        return ok(await accountService.validate(request.id));

      case 'account/validateAll':
        return ok(await accountService.validateAll());

      case 'account/activate':
        return ok(await accountService.activate(request.id));

      case 'account/login': {
        const settings = await readSettings();
        return ok(await accountService.login(request.id, settings.openInNewWindow));
      }

      case 'account/logout':
        return ok(await accountService.logout());

      case 'settings/update':
        return ok(await writeSettings(request.patch));

      case 'vault/lock':
        vault.lock();
        return ok(await vault.state());

      case 'vault/unlock':
        await vault.unlock(request.passphrase);
        return ok(await vault.state());

      case 'vault/setPassphrase':
        await vault.setPassphrase(request.passphrase);
        return ok(await vault.state());

      case 'vault/removePassphrase':
        await vault.removePassphrase();
        return ok(await vault.state());

      case 'vault/destroy':
        await vault.destroy();
        return ok(await vault.state());

      case 'token/extract': {
        const { token } = await extractFromActiveSession();
        return ok(token);
      }

      case 'token/login': {
        const settings = await readSettings();
        return ok(
          await accountService.loginWithToken(request.token, {
            openInNewWindow: settings.openInNewWindow,
          }),
        );
      }

      case 'token/validate': {
        const check = await accountService.probe(request.token);
        const profile = check.user;
        return ok({
          valid: check.valid,
          message: check.message,
          displayName: profile ? (profile.global_name ?? profile.username) : null,
          tag: profile
            ? `${profile.username}${profile.discriminator === '0' ? '' : `#${profile.discriminator}`}`
            : null,
        });
      }

      default: {
        // Exhaustiveness guard: adding a Request variant without a handler
        // becomes a compile error rather than a silent no-op.
        const never: never = request;
        throw new Error(`Unhandled request: ${JSON.stringify(never)}`);
      }
    }
  } catch (error) {
    return fail(error);
  } finally {
    if (!READ_ONLY.has(request.type)) void broadcast();
  }
}
