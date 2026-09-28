/**
 * Application service. Every operation the UI can trigger lands here.
 *
 * Rules this layer enforces:
 *  - tokens are decrypted only for the duration of one call
 *  - a token never appears in a returned object that goes back to the UI
 *  - the active-account pointer is cleared whenever its record disappears
 */

import { NETWORK } from '../core/constants';
import { createLogger } from '../core/logger';
import type { Account, AccountRecord, AppState, Settings } from '../core/types';
import { mapLimit, sleep } from '../core/utils/async';
import {
  buildAvatarDecorationUrl,
  buildAvatarUrl,
  resolveAccentColor,
  snowflakeToDate,
} from '../core/utils/format';
import { vault } from '../crypto/vault';
import { readSettings, writeSettings } from '../platform/settings';
import { checkToken, classifyApiError, looksLikeToken, type TokenCheck } from './discord-client';
import { signIn, signOut } from './session-injector';

const log = createLogger('accounts');

type Profile = {
  id: string;
  username: string;
  global_name: string | null;
  discriminator: string;
  avatar: string | null;
  accent_color: number | null;
  avatar_decoration?: string | null;
  avatar_decoration_data?: { asset: string } | null;
};

/** Maps a Discord profile onto our stored account, preserving local fields. */
function toAccount(user: Profile, existing?: Account): Account {
  const now = Date.now();
  const legacyTag = user.discriminator === '0' ? '' : `#${user.discriminator}`;
  // The structured payload is what current API versions return; the flat hash
  // is the same decoration from older ones.
  const decoration = user.avatar_decoration_data?.asset ?? user.avatar_decoration ?? null;

  return {
    id: user.id,
    tag: `${user.username}${legacyTag}`,
    displayName: user.global_name ?? user.username,
    avatarUrl: buildAvatarUrl(user.id, user.avatar),
    avatarDecorationUrl: buildAvatarDecorationUrl(decoration),
    accentColor: resolveAccentColor(user.id, user.accent_color),
    status: 'valid',
    note: existing?.note ?? '',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastUsedAt: existing?.lastUsedAt ?? null,
    lastValidatedAt: now,
  };
}

/** Active account first, then most recently used, then alphabetical. */
function sortForDisplay(accounts: Account[], activeId: string | null): Account[] {
  return [...accounts].sort((a, b) => {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    const aUsed = a.lastUsedAt ?? 0;
    const bUsed = b.lastUsedAt ?? 0;
    if (aUsed !== bUsed) return bUsed - aUsed;
    return a.displayName.localeCompare(b.displayName);
  });
}

export const accountService = {
  /* ------------------------------------------------------------- reading */

  async list(): Promise<Account[]> {
    const ids = await vault.listIds();
    const settings = await readSettings();
    const records = await mapLimit(ids, 8, async (id) => vault.read<AccountRecord>(id));

    const accounts = records
      .filter((record): record is AccountRecord => record !== null)
      .map((record) => record.account);

    return sortForDisplay(accounts, settings.activeAccountId);
  },

  async state(): Promise<AppState> {
    const [ids, settings, lock] = await Promise.all([
      vault.listIds(),
      readSettings(),
      vault.state(),
    ]);
    const records = await mapLimit(ids, 8, async (id) => vault.read<AccountRecord>(id));
    const unreadableAccountIds = ids.filter((_, index) => records[index] === null);
    const accounts = records
      .filter((record): record is AccountRecord => record !== null)
      .map((record) => record.account);

    const activeAccountId = accounts.some((a) => a.id === settings.activeAccountId)
      ? settings.activeAccountId
      : null;

    return {
      accounts: sortForDisplay(accounts, activeAccountId),
      unreadableAccountIds,
      activeAccountId,
      lock,
      settings: { ...settings, activeAccountId },
    };
  },

  async count(): Promise<number> {
    return (await vault.listIds()).length;
  },
  /* ------------------------------------------------------------- writing */

  /**
   * Validates a token, then stores it. An account that is already saved is
   * refreshed in place rather than duplicated, since the snowflake is the key.
   */
  async add(token: string, note = ''): Promise<Account> {
    const trimmed = token.trim();
    if (!looksLikeToken(trimmed)) {
      throw new Error(
        'That does not look like a complete Discord token. It should be a single long ' +
          'string with no spaces — copy the whole value, not just part of it.',
      );
    }

    const check = await checkToken(trimmed);
    if (!check.valid || check.user === null) {
      throw new Error(check.message);
    }

    const existing = await vault.read<AccountRecord>(check.user.id);
    const account = toAccount(check.user, existing?.account);
    if (note.length > 0) account.note = note;

    const record: AccountRecord = { token: trimmed, account };
    await vault.write(check.user.id, record);

    log.info(`Stored account ${account.tag}`);
    return account;
  },

  async remove(id: string): Promise<void> {
    await vault.remove(id);

    const settings = await readSettings();
    if (settings.activeAccountId === id) {
      await writeSettings({ activeAccountId: null });
    }
  },

  async update(
    id: string,
    patch: Partial<Pick<Account, 'note' | 'displayName'>>,
  ): Promise<Account> {
    const record = await vault.read<AccountRecord>(id);
    if (record === null) throw new Error('That account no longer exists.');

    const account: Account = { ...record.account, ...patch, updatedAt: Date.now() };
    await vault.write(id, { token: record.token, account });
    return account;
  },

  /* --------------------------------------------------------- validation */

  async validate(id: string): Promise<Account> {
    const record = await vault.read<AccountRecord>(id);
    if (record === null) throw new Error('That account no longer exists.');

    const check = await checkToken(record.token);
    const account: Account = { ...record.account, updatedAt: Date.now() };

    if (check.valid && check.user !== null) {
      Object.assign(account, toAccount(check.user, record.account));
    } else {
      account.status = check.status;
    }

    await vault.write(id, { token: record.token, account });
    return account;
  },

  /**
   * Refreshes every stored account. Concurrency is capped and jittered so a
   * dozen saved accounts do not fire twelve simultaneous requests at Discord.
   */
  async validateAll(): Promise<Account[]> {
    const ids = await vault.listIds();
    log.info(`Validating ${ids.length} account(s)`);

    return mapLimit(ids, 3, async (id) => {
      await sleep(Math.random() * NETWORK.VALIDATION_JITTER_MS);
      const record = await vault.read<AccountRecord>(id);
      if (record === null) throw new Error('Account disappeared during validation.');

      const check: TokenCheck = await checkToken(record.token);
      const account: Account = { ...record.account, updatedAt: Date.now() };

      if (check.valid && check.user !== null) {
        Object.assign(account, toAccount(check.user, record.account));
      } else {
        account.status = check.status;
      }

      await vault.write(id, { token: record.token, account });
      return account;
    });
  },

  /** Best-effort status probe used after a failed action. Never throws. */
  async probe(token: string): Promise<TokenCheck> {
    try {
      return await checkToken(token);
    } catch (error) {
      return {
        valid: false,
        user: null,
        status: 'error',
        message: classifyApiError(error).message,
      };
    }
  },
  /* ------------------------------------------------------------- session */

  async activate(id: string): Promise<Settings> {
    const record = await vault.read<AccountRecord>(id);
    if (record === null) throw new Error('That account no longer exists.');

    const account: Account = {
      ...record.account,
      lastUsedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await vault.write(id, { token: record.token, account });
    return writeSettings({ activeAccountId: id });
  },

  /**
   * Signs a saved account in. The token is re-validated first: writing a stale
   * token into `localStorage` would leave the user stuck in a login loop.
   */
  async login(id: string, openInNewWindow = false): Promise<Account> {
    const record = await vault.read<AccountRecord>(id);
    if (record === null) throw new Error('That account no longer exists.');

    const check = await checkToken(record.token);
    if (!check.valid) {
      const account: Account = { ...record.account, status: check.status, updatedAt: Date.now() };
      await vault.write(id, { token: record.token, account });
      throw new Error(check.message);
    }

    await signIn(record.token, { openInNewWindow });

    const account: Account = {
      ...record.account,
      status: 'valid',
      lastUsedAt: Date.now(),
      lastValidatedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await vault.write(id, { token: record.token, account });
    await writeSettings({ activeAccountId: id });

    return account;
  },

  /** Saves a pasted/extracted token, signs in, and marks it active. */
  async loginWithToken(
    token: string,
    options: { openInNewWindow?: boolean; note?: string } = {},
  ): Promise<Account> {
    const account = await this.add(token, options.note ?? '');
    await signIn(token, { openInNewWindow: options.openInNewWindow === true });
    await this.activate(account.id);
    return account;
  },

  /** Clears the session from every Discord tab. Returns tabs affected. */
  async logout(): Promise<number> {
    const cleared = await signOut();
    await writeSettings({ activeAccountId: null });
    log.info(`Signed out of ${cleared} tab(s)`);
    return cleared;
  },

  /* -------------------------------------------------------------- extras */

  /** Resolves an account id from a token without handing the token to the UI. */
  async peekId(token: string): Promise<string | null> {
    const check = await checkToken(token);
    return check.user?.id ?? null;
  },

  /** Discord epoch decode for the "joined" line in the account detail sheet. */
  createdDateOf(id: string): Date | null {
    return snowflakeToDate(id);
  },
};
