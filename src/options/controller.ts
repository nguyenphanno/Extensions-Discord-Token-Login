/**
 * Options page controller.
 *
 * Same contract as the popup — render from a snapshot, mutate through the
 * worker, let the worker push the result back. The only page-specific work is
 * the vault mode panel, which needs a passphrase to be set and confirmed.
 */

import { CRYPTO } from '../core/constants';
import { createLogger } from '../core/logger';
import type { Account, AppState, LockState, Settings } from '../core/types';
import { formatRelativeTime, initials, pluralize } from '../core/utils/format';
import { call, onStateChange, RpcError } from '../platform/messaging';
import { el, on, qs, qsa } from '../ui/dom';
import { busy, confirmSheet, toast } from '../ui/feedback';
import { icon, type IconName } from '../ui/icons';

const log = createLogger('options');

const STATUS_PILL: Record<Account['status'], { label: string; className: string }> = {
  valid: { label: 'Active', className: 'pill pill--success' },
  unknown: { label: 'Unchecked', className: 'pill' },
  expired: { label: 'Expired', className: 'pill pill--danger' },
  locked: { label: 'Locked', className: 'pill pill--warning' },
  error: { label: 'Unreachable', className: 'pill' },
};

const LOCK_COPY: Record<LockState, string> = {
  unprotected: 'Device key',
  unlocked: 'Unlocked',
  locked: 'Locked',
};

export class OptionsController {
  #state: AppState | null = null;
  #unsubscribe: (() => void) | null = null;

  /* ------------------------------------------------------------------ boot */

  async start(): Promise<void> {
    this.hydrateIcons();
    this.wire();
    await this.showKdfCost();
    this.#unsubscribe = onStateChange((state) => this.render(state));
    await this.refresh();
  }

  /** Releases the worker subscription when the tab goes away. */
  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  hydrateIcons(): void {
    for (const host of qsa<HTMLElement>('[data-icon]')) {
      const name = host.dataset['icon'] as IconName | undefined;
      if (name !== undefined) host.replaceChildren(icon(name, { size: 18 }));
    }
    document
      .querySelector<HTMLElement>('[data-mark]')
      ?.replaceChildren(icon('brand', { size: 22 }));

    const version = chrome.runtime.getManifest()['version'];
    qs('[data-slot="version"]').textContent = String(version ?? '—');
  }

  /** Measures one derivation on this machine, so the cost claim is real. */
  async showKdfCost(): Promise<void> {
    const slot = qs<HTMLElement>('[data-slot="unlock-cost"]');
    qs('[data-slot="iterations"]').textContent = CRYPTO.PBKDF2_ITERATIONS.toLocaleString();

    try {
      const { createKdfParams, benchmarkUnlock } = await import('../crypto/key-derivation');
      const ms = await benchmarkUnlock(createKdfParams());
      slot.textContent = `On this machine, one unlock takes roughly ${Math.round(ms)} ms.`;
    } catch (error) {
      log.debug('Unlock benchmark unavailable', error);
      slot.textContent = 'Unlock cost is measured on your machine when you set one.';
    }
  }

  /* ---------------------------------------------------------------- render */

  async refresh(): Promise<void> {
    try {
      this.render(await call<AppState>({ type: 'state/get' }));
    } catch (error) {
      this.toastError(error);
    }
  }

  render(state: AppState): void {
    this.#state = state;

    const pill = qs<HTMLElement>('[data-slot="vault-pill"]');
    pill.textContent = LOCK_COPY[state.lock];
    pill.className =
      state.lock === 'locked'
        ? 'pill pill--warning'
        : state.lock === 'unlocked'
          ? 'pill pill--success'
          : 'pill';

    const usingPassphrase = state.lock !== 'unprotected';
    qs('[data-mode="device"]').className = usingPassphrase
      ? 'mode mode--muted'
      : 'mode mode--active';
    qs('[data-mode="passphrase"]').className = usingPassphrase
      ? 'mode mode--active'
      : 'mode mode--muted';

    qs<HTMLButtonElement>('[data-action="start-passphrase"]').hidden = usingPassphrase;
    qs<HTMLButtonElement>('[data-action="drop-passphrase"]').hidden = !usingPassphrase;
    qs<HTMLButtonElement>('[data-action="lock"]').hidden = state.lock !== 'unlocked';

    this.renderAccounts(state);
    this.renderSettings(state.settings);
    qs('[data-slot="account-count"]').textContent = String(state.accounts.length);
    this.trackSection();
  }
  private renderAccounts(state: AppState): void {
    const list = qs<HTMLUListElement>('[data-slot="account-rows"]');
    const lede = qs<HTMLElement>('[data-slot="accounts-lede"]');

    lede.textContent =
      state.accounts.length === 0
        ? 'No accounts are stored in this browser yet.'
        : `${pluralize(state.accounts.length, 'account')} stored, encrypted at rest.`;

    if (state.accounts.length === 0) {
      list.className = 'rows rows--empty';
      list.replaceChildren(
        el('li', {
          text: 'Add one from the extension popup — paste a token, or capture a live session.',
        }),
      );
      return;
    }

    list.className = 'rows';
    list.replaceChildren(
      ...state.accounts.map((account) =>
        this.accountRow(account, account.id === state.activeAccountId),
      ),
    );
  }

  private accountRow(account: Account, isActive: boolean): HTMLLIElement {
    const status = STATUS_PILL[account.status];

    const signIn = el(
      'button',
      {
        class: 'btn btn--primary btn--sm',
        type: 'button',
        'data-act': 'sign-in',
        'data-id': account.id,
      },
      [icon('signIn', { size: 20 }), document.createTextNode('Sign in')],
    );

    const remove = el(
      'button',
      {
        class: 'btn btn--icon',
        type: 'button',
        'data-act': 'remove',
        'data-id': account.id,
        title: `Remove ${account.displayName}`,
      },
      [icon('trash', { size: 18 })],
    );
    remove.append(el('span', { class: 'visually-hidden', text: `Remove ${account.displayName}` }));

    return el('li', { class: `row-item${isActive ? ' row-item--active' : ''}` }, [
      avatarNode(account),
      el('div', { class: 'row-item__body' }, [
        el('div', { class: 'row-item__name' }, [
          el('span', { class: 'truncate', text: account.displayName }),
          isActive ? el('span', { class: 'pill pill--brand', text: 'Active' }) : null,
          el('span', { class: status.className, text: status.label }),
        ]),
        el('div', { class: 'row-item__meta' }, [
          el('span', { text: account.tag }),
          el('span', { class: 'mono', text: account.id }),
          el('span', { text: `used ${formatRelativeTime(account.lastUsedAt)}` }),
          account.note.length > 0 ? el('span', { text: `· ${account.note}` }) : null,
        ]),
      ]),
      el('div', { class: 'row-item__actions' }, [signIn, remove]),
    ]);
  }

  private renderSettings(settings: Settings): void {
    for (const input of qsa<HTMLInputElement>('[data-setting]')) {
      const key = input.dataset['setting'] as keyof Settings | undefined;
      if (key !== undefined) input.checked = Boolean(settings[key]);
    }
  }

  /** Highlights whichever section is currently in the reading position. */
  private trackSection(): void {
    const sections = qsa<HTMLElement>('.section');
    const links = qsa<HTMLElement>('.sidenav__item');

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible === undefined) return;

        for (const link of links) {
          link.classList.toggle(
            'sidenav__item--current',
            link.dataset['section'] === visible.target.id,
          );
        }
      },
      { rootMargin: '-88px 0px -60% 0px', threshold: 0 },
    );

    for (const section of sections) observer.observe(section);
  }
  /* ---------------------------------------------------------------- events */

  private wire(): void {
    on(document.body, 'click', (event) => this.onClick(event));
    on(document.body, 'change', (event) => this.onSettingChange(event));

    for (const link of qsa<HTMLElement>('.sidenav__item')) {
      on(link, 'click', (event) => {
        event.preventDefault();
        const target = link.getAttribute('href');
        if (target === null) return;
        document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  private onSettingChange(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const key = input.dataset['setting'] as keyof Settings | undefined;
    if (key === undefined) return;

    const patch = { [key]: input.checked } as Partial<Settings>;
    void call({ type: 'settings/update', patch })
      .then(() => toast('Preference saved.', 'success', 1_400))
      .catch((error: unknown) => this.toastError(error));
  }

  private async onClick(event: MouseEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Row buttons are handled here (not via `change`) so keyboard activation,
    // which fires `click`, behaves identically to a mouse press.
    const rowButton = target.closest<HTMLElement>('[data-act]');
    if (rowButton !== null) {
      const id = rowButton.dataset['id'];
      if (id === undefined) return;
      if (rowButton.dataset['act'] === 'sign-in') {
        await this.signIn(id, rowButton as HTMLButtonElement);
      }
      if (rowButton.dataset['act'] === 'remove') await this.remove(id);
      return;
    }

    const trigger = target.closest<HTMLElement>('[data-action]');
    if (trigger === null) return;

    switch (trigger.dataset['action']) {
      case 'validate-all':
        await this.validateAll(trigger as HTMLButtonElement);
        break;
      case 'logout':
        await this.signOut();
        break;
      case 'start-passphrase':
        this.showPassphraseForm(true);
        break;
      case 'cancel-passphrase':
        this.showPassphraseForm(false);
        break;
      case 'set-passphrase':
        await this.setPassphrase(trigger as HTMLButtonElement);
        break;
      case 'drop-passphrase':
        await this.dropPassphrase();
        break;
      case 'lock':
        await call({ type: 'vault/lock' }).then(() => toast('Vault locked.', 'success'));
        await this.refresh();
        break;
      case 'wipe':
        await this.wipe();
        break;
      default:
        log.warn('Unhandled action', trigger.dataset['action']);
    }
  }

  private async signIn(id: string, button: HTMLElement): Promise<void> {
    const handle = busy(button as HTMLButtonElement, 'Signing in…');
    try {
      const account = await call<Account>({ type: 'account/login', id });
      handle.done();
      toast(`Signed in as ${account.displayName}.`, 'success');
    } catch (error) {
      handle.fail(this.toastError(error));
    }
    await this.refresh();
  }

  private async remove(id: string): Promise<void> {
    const state = this.#state;
    const account = state?.accounts.find((candidate) => candidate.id === id);
    if (account === undefined) return;

    const confirmed = await confirmSheet({
      title: `Remove ${account.displayName}?`,
      body: 'The encrypted token is deleted from this browser immediately.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await call({ type: 'account/remove', id });
      toast(`Removed ${account.tag}.`, 'success');
    } catch (error) {
      this.toastError(error);
    }
    await this.refresh();
  }

  private async validateAll(button: HTMLButtonElement): Promise<void> {
    const handle = busy(button, 'Checking…');
    try {
      const accounts = await call<Account[]>({ type: 'account/validateAll' });
      const broken = accounts.filter((account) => account.status !== 'valid');
      toast(
        broken.length === 0
          ? `All ${pluralize(accounts.length, 'token')} responding.`
          : `${broken.length} of ${accounts.length} need attention.`,
        broken.length === 0 ? 'success' : 'warning',
      );
    } catch (error) {
      handle.fail(this.toastError(error));
      return;
    } finally {
      handle.done();
    }
    await this.refresh();
  }

  private async signOut(): Promise<void> {
    const confirmed = await confirmSheet({
      title: 'Sign out of Discord?',
      body: 'This clears the session from every open Discord tab in this browser.',
      confirmLabel: 'Sign out',
    });
    if (!confirmed) return;

    try {
      await call({ type: 'account/logout' });
      toast('Signed out of Discord.', 'success');
    } catch (error) {
      this.toastError(error);
    }
    await this.refresh();
  }
  /* -------------------------------------------------------------- security */

  private showPassphraseForm(visible: boolean): void {
    const panel = qs<HTMLElement>('[data-slot="passphrase-panel"]');
    panel.hidden = !visible;
    if (!visible) {
      qs<HTMLInputElement>('#new-pass').value = '';
      qs<HTMLInputElement>('#confirm-pass').value = '';
      qs('[data-slot="pass-error"]').hidden = true;
      return;
    }
    qs<HTMLInputElement>('#new-pass').focus();
  }

  private async setPassphrase(button: HTMLButtonElement): Promise<void> {
    const first = qs<HTMLInputElement>('#new-pass');
    const second = qs<HTMLInputElement>('#confirm-pass');
    const error = qs<HTMLElement>('[data-slot="pass-error"]');

    error.hidden = true;

    if (first.value.length < 8) {
      error.textContent = 'Use at least 8 characters. Longer is better.';
      error.hidden = false;
      first.focus();
      return;
    }
    if (first.value !== second.value) {
      error.textContent = 'The two passphrases do not match.';
      error.hidden = false;
      second.focus();
      return;
    }

    const handle = busy(button, 'Encrypting…');
    try {
      await call({ type: 'vault/setPassphrase', passphrase: first.value });
      handle.done();
      this.showPassphraseForm(false);
      toast('Vault is now passphrase protected.', 'success');
    } catch (error) {
      handle.fail(this.toastError(error));
    }
    await this.refresh();
  }

  private async dropPassphrase(): Promise<void> {
    const confirmed = await confirmSheet({
      title: 'Remove the passphrase?',
      body: 'Every token is re-encrypted under a new device key held in browser storage.',
      footnote: 'Anyone with access to this profile can then read your tokens.',
      confirmLabel: 'Remove passphrase',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await call({ type: 'vault/removePassphrase' });
      toast('Passphrase removed. The vault now uses a device key.', 'success');
    } catch (error) {
      this.toastError(error);
    }
    await this.refresh();
  }

  private async wipe(): Promise<void> {
    const confirmed = await confirmSheet({
      title: 'Erase everything?',
      body: 'Deletes every stored token, the encryption key, and all preferences.',
      footnote: 'This cannot be undone. You will need the original tokens again.',
      confirmLabel: 'Erase all data',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await call({ type: 'vault/destroy' });
      toast('All extension data erased.', 'success');
    } catch (error) {
      this.toastError(error);
    }
    await this.refresh();
  }

  private toastError(error: unknown): string {
    const message = error instanceof RpcError ? error.message : 'Something went wrong.';
    if (!(error instanceof RpcError)) log.error('Unexpected options failure', error);
    toast(message, 'error');
    return message;
  }
}

function avatarNode(account: Account): HTMLElement {
  const node = el('span', { class: 'avatar avatar--md' });

  if (account.avatarUrl !== null) {
    const image = el('img', {
      src: account.avatarUrl,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
    });
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

  // Same wrapper rule as the popup: the decoration overflows the avatar, so
  // it cannot live inside the element that clips to a circle.
  if (account.avatarDecorationUrl) {
    const decoration = el('img', {
      class: 'avatar__decoration',
      src: account.avatarDecorationUrl,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
    });
    decoration.addEventListener('error', () => decoration.remove());
    return el('span', { class: 'avatar-decorated' }, [node, decoration]);
  }

  return node;
}

export const optionsController = new OptionsController();
