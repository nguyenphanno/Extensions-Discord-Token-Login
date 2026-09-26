/**
 * Popup controller.
 *
 * Owns a single `AppState` snapshot and re-renders from it. Every interaction
 * is a message to the worker; the worker answers by pushing a fresh snapshot
 * back, so there is exactly one code path that mutates what the user sees. That
 * is what keeps the popup, the toolbar badge and the context menu consistent
 * without any of them knowing about each other.
 */

import { createLogger } from '../core/logger';
import type { Account, AppState } from '../core/types';
import { maskToken, parseTokenFile, pluralize, readTextFile } from '../core/utils/format';
import { call, onStateChange, openOptions, RpcError } from '../platform/messaging';
import { on, qs, qsa } from '../ui/dom';
import { busy, confirmSheet, copyToClipboard, promptSheet, toast, tryCopy } from '../ui/feedback';
import { icon, type IconName } from '../ui/icons';
import { accountRow, accountsLede } from './account-row';
import { openMenu, type MenuEntry } from './popover';

const log = createLogger('popup');

type ViewName = 'locked' | 'login' | 'accounts';
type TabName = 'login' | 'accounts';

const HANDOFF_KEY = 'dtl:handoff';

const EMPTY_STATE: AppState = {
  accounts: [],
  activeAccountId: null,
  lock: 'unprotected',
  settings: {
    activeAccountId: null,
    focusTokenOnOpen: true,
    clearTokenAfterLogin: true,
    revealToken: false,
    openInNewWindow: false,
    showBadge: true,
  },
};

class PopupController {
  #state: AppState = EMPTY_STATE;
  #tab: TabName = 'login';
  #tokenField!: HTMLInputElement;
  #tokenWrap!: HTMLElement;
  #revealed = false;
  #unsubscribe: (() => void) | null = null;

  /* ------------------------------------------------------------------ boot */

  async start(): Promise<void> {
    this.#tokenField = qs<HTMLInputElement>('#token');
    this.#tokenWrap = qs<HTMLElement>('.token-field');
    this.hydrateStaticIcons();
    this.wireEvents();
    this.#applyMasking(EMPTY_STATE.settings.revealToken);
    this.#syncTokenState();

    this.#unsubscribe = onStateChange((state) => this.apply(state));

    await this.refresh();

    // A context-menu action leaves a result for us to surface.
    await this.#drainHandoff();
    this.#focusTokenIfWanted();
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  /** Fills every `data-icon` placeholder declared in the HTML. */
  hydrateStaticIcons(): void {
    for (const host of qsa<HTMLElement>('[data-icon]')) {
      const name = host.dataset['icon'] as IconName | undefined;
      if (name === undefined) continue;
      host.replaceChildren(icon(name, { size: 18 }));
    }
    document.querySelector<HTMLElement>('[data-mark]')?.replaceChildren(icon('brand', { size: 22 }));
  }

  /**
   * Drives the dashed/solid border swap. The field advertises itself as an
   * empty drop target until it has content, then calms down to a normal field.
   */
  #syncTokenState(): void {
    const filled = this.#tokenField.value.trim().length > 0;
    this.#tokenWrap.dataset['state'] = filled ? 'filled' : 'empty';
  }

  /* ---------------------------------------------------------------- render */

  apply(state: AppState): void {
    this.#state = state;
    this.render();
  }

  async refresh(): Promise<void> {
    try {
      this.apply(await call<AppState>({ type: 'state/get' }));
    } catch (error) {
      log.error('Could not load state', error);
      this.toastError(error);
    }
  }

  render(): void {
    const { lock, accounts, activeAccountId } = this.#state;

    this.renderTopbar(lock);
    this.renderTabs(lock, accounts.length);

    const view: ViewName = lock === 'locked' ? 'locked' : this.#tab;
    this.showView(view);
    if (view === 'accounts') this.renderAccounts();
    this.renderStatusbar(accounts, activeAccountId);
  }

  private renderTopbar(lock: AppState['lock']): void {
    const label = qs<HTMLElement>('[data-slot="vault-state"]');
    const lockButton = qs<HTMLButtonElement>('[data-action="lock"]');

    const copy = {
      unprotected: 'Device key · AES-256-GCM',
      locked: 'Locked',
      unlocked: 'Unlocked · this session',
    }[lock];

    label.textContent = copy;
    lockButton.hidden = lock !== 'unlocked';
  }

  private renderTabs(lock: AppState['lock'], count: number): void {
    const nav = qs<HTMLElement>('.segmented');
    const tabs = qsa<HTMLButtonElement>('.segmented__tab');

    // The tab bar is meaningless while the vault is locked.
    nav.style.opacity = lock === 'locked' ? '0.4' : '1';
    for (const tab of tabs) {
      tab.disabled = lock === 'locked';
    }

    const badge = qs<HTMLElement>('[data-slot="account-count"]');
    badge.hidden = count === 0;
    badge.style.display = count === 0 ? 'none' : '';
    badge.textContent = String(count);

    this.moveThumb();
  }

  /**
   * Positions the sliding thumb under the selected tab. Measured rather than
   * hard-coded, so it stays correct if the label or count changes width.
   */
  private moveThumb(): void {
    const selected = document.querySelector<HTMLElement>('.segmented__tab[aria-selected="true"]');
    const nav = qs<HTMLElement>('.segmented');
    if (selected === null) return;

    const navBox = nav.getBoundingClientRect();
    const tabBox = selected.getBoundingClientRect();
    nav.style.setProperty('--thumb-x', `${tabBox.left - navBox.left}px`);
    nav.style.setProperty('--thumb-width', `${tabBox.width}px`);
  }
  private showView(view: ViewName): void {
    for (const section of qsa<HTMLElement>('[data-view]')) {
      section.hidden = section.dataset['view'] !== view;
    }
    for (const tab of qsa<HTMLButtonElement>('.segmented__tab')) {
      const name = tab.dataset['tab'] as TabName | undefined;
      tab.setAttribute('aria-selected', String(name === this.#tab));
    }
    // Re-measure after the visibility flip so the thumb animates to its new home.
    requestAnimationFrame(() => this.moveThumb());
    qs<HTMLElement>('.stage').scrollTop = 0;
  }

  private renderAccounts(): void {
    const { accounts, activeAccountId } = this.#state;
    const list = qs<HTMLUListElement>('[data-slot="account-list"]');
    const empty = qs<HTMLElement>('[data-slot="accounts-empty"]');
    const lede = qs<HTMLElement>('[data-slot="accounts-lede"]');

    lede.textContent = accountsLede(accounts);
    const hasAccounts = accounts.length > 0;
    empty.hidden = hasAccounts;
    empty.style.display = hasAccounts ? 'none' : 'flex';
    list.hidden = !hasAccounts;
    list.style.display = hasAccounts ? 'flex' : 'none';

    const rows = accounts.map((account, index) =>
      accountRow({
        account,
        isActive: account.id === activeAccountId,
        index: index + 1,
        total: accounts.length,
      }),
    );

    list.replaceChildren(...rows);
  }

  private renderStatusbar(accounts: Account[], activeId: string | null): void {
    const pip = qs<HTMLElement>('[data-slot="active-pip"]');
    const label = qs<HTMLElement>('[data-slot="active-label"]');
    const logout = qs<HTMLButtonElement>('[data-action="logout"]');

    const active = accounts.find((account) => account.id === activeId) ?? null;
    pip.classList.toggle('statusbar__pip--on', active !== null);
    logout.hidden = active === null;
    label.textContent = active === null ? 'Not signed in' : `Signed in as ${active.displayName}`;
    label.title = active === null ? '' : `${active.tag} · ${maskToken(active.id)}`;
  }

  /* ---------------------------------------------------------------- events */

  private wireEvents(): void {
    on(document.body, 'click', (event) => this.#onClick(event));

    on(qs<HTMLFormElement>('[data-form="login"]'), 'submit', (event) => {
      event.preventDefault();
      void this.#signInFromField();
    });

    on(qs<HTMLFormElement>('[data-form="unlock"]'), 'submit', (event) => {
      event.preventDefault();
      void this.#unlock();
    });

    on(this.#tokenField, 'input', () => {
      this.#syncTokenState();
    });

    // Ctrl/Cmd+Enter submits from anywhere in the token field.
    on(this.#tokenField, 'keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void this.#signInFromField();
      }
    });

    window.addEventListener('resize', () => this.moveThumb());

    this.#wireFileInput();
    this.#wireDropTarget();
  }

  /* ------------------------------------------------------------ file import */

  #fileInput!: HTMLInputElement;

  /**
   * The button is a styled `<button>`; the real `<input type="file">` is
   * visually hidden and clicked on its behalf. That keeps the native OS picker,
   * including drag-and-drop onto the dialog and per-site folder memory, instead
   * of reimplementing a worse version of it.
   */
  #pickFile(): void {
    // Reset first, or re-picking the same file fires no `change` event.
    this.#fileInput.value = '';
    this.#fileInput.click();
  }

  #wireFileInput(): void {
    this.#fileInput = qs<HTMLInputElement>('#token-file');
    on(this.#fileInput, 'change', () => {
      const file = this.#fileInput.files?.[0];
      if (file !== undefined) void this.#importFile(file);
    });
  }

  /** Makes the token field a drop target for .txt exports. */
  #wireDropTarget(): void {
    const wrap = this.#tokenWrap;

    // dragenter/dragleave fire for every child element, so a naive toggle
    // flickers. Count enters/leaves instead of flipping a boolean.
    let depth = 0;

    on(wrap, 'dragenter', (event) => {
      event.preventDefault();
      depth += 1;
      wrap.dataset['drag'] = 'over';
    });

    on(wrap, 'dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) delete wrap.dataset['drag'];
    });

    on(wrap, 'dragover', (event) => {
      event.preventDefault();
      // Required, or Chrome refuses the drop entirely.
      (event as DragEvent).dataTransfer?.setData('text/plain', '');
    });

    on(wrap, 'drop', (event) => {
      event.preventDefault();
      depth = 0;
      delete wrap.dataset['drag'];

      const file = (event as DragEvent).dataTransfer?.files[0];
      if (file === undefined) return;
      void this.#importFile(file);
    });
  }

  /**
   * Reads a token export and acts on what it finds.
   *
   * One token fills the field, because that is what the user was about to type.
   * Several are imported as accounts in one pass, because that is the whole
   * reason someone exports a list.
   */
  async #importFile(file: File): Promise<void> {
    let tokens: string[];
    try {
      tokens = parseTokenFile(await readTextFile(file));
    } catch (error) {
      this.toastError(error);
      return;
    }

    if (tokens.length === 0) {
      toast(`No tokens found in ${file.name}.`, 'warning');
      return;
    }

    if (tokens.length === 1) {
      this.#tokenField.value = tokens[0] as string;
      this.#syncTokenState();
      toast('Token loaded from file. Review it, then press Sign in.', 'success');
      return;
    }

    await this.#importMany(tokens);
  }

  /** Validates and stores a whole list, reporting per-token failures at the end. */
  async #importMany(tokens: string[]): Promise<void> {
    const handle = busy(qs<HTMLButtonElement>('[data-submit="login"]'), 'Importing…');
    const saved: string[] = [];
    const failed: string[] = [];

    for (const token of tokens) {
      try {
        const account = await call<Account>({ type: 'account/add', token });
        saved.push(account.tag);
      } catch {
        // A single bad token must not abandon the rest of the list.
        failed.push(token);
      }
    }

    handle.done();

    if (saved.length > 0) {
      this.#tab = 'accounts';
      await this.refresh();
    }

    if (failed.length === 0) {
      toast(`Imported ${pluralize(saved.length, 'account')}.`, 'success');
      return;
    }

    const summary = `Imported ${saved.length}, ${failed.length} rejected by Discord.`;
    if (saved.length === 0) toast(summary, 'error');
    else toast(`${summary} Open one to see why.`, 'warning');
  }

  /** One delegated handler for everything with a `data-action`. */
  async #onClick(event: MouseEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const tab = target.closest<HTMLElement>('[data-tab]');
    if (tab !== null) {
      this.#tab = tab.dataset['tab'] as TabName;
      this.render();
      return;
    }

    const trigger = target.closest<HTMLElement>('[data-action]');
    if (trigger === null) return;

    const action = trigger.dataset['action'];
    const id = trigger.dataset['id'];

    switch (action) {
      case 'copy-token':
        await this.#copyToken();
        break;
      case 'capture':
        await this.#capture(trigger);
        break;
      case 'pick-file':
        this.#pickFile();
        break;
      case 'save-only':
        await this.#saveOnly(trigger);
        break;
      case 'sign-in':
        await this.#signIn(id, trigger);
        break;
      case 'menu':
        this.#openAccountMenu(trigger, id);
        break;
      case 'validate-all':
        await this.#validateAll(trigger);
        break;
      case 'logout':
        await this.#logout();
        break;
      case 'lock':
        await this.#lock();
        break;
      case 'settings':
        await openOptions();
        break;
      case 'goto-login':
        this.#tab = 'login';
        this.render();
        break;
      default:
        log.warn('Unhandled action', action);
    }
  }
  /* --------------------------------------------------------------- actions */

  /**
   * The field is a real `<input type="password">`, so masking is the browser's
   * job rather than a compositor trick — which also means the browser's own
   * "show password" affordance and password managers behave correctly.
   */
  #applyMasking(revealed: boolean): void {
    this.#revealed = revealed;
    this.#tokenField.type = revealed ? 'text' : 'password';
  }

  /** Copies the token in the field, if there is one to copy. */
  async #copyToken(): Promise<void> {
    const token = this.#tokenField.value.trim();
    if (token === '') {
      toast('There is no token to copy yet.', 'warning');
      return;
    }

    // Unmask first: copying a field of dots is worse than useless.
    const wasMasked = !this.#revealed;
    if (wasMasked) this.#applyMasking(true);

    if (await tryCopy(token)) {
      if (!wasMasked) {
        toast('Token copied.', 'success');
        return;
      }
      // Re-mask shortly after, so the user sees the copy land but cannot leave
      // the token sitting on screen.
      setTimeout(() => this.#applyMasking(false), 1_200);
      toast('Token copied. The field re-masks in a moment.', 'success');
      return;
    }

    if (wasMasked) this.#applyMasking(false);
    toast('Chrome blocked clipboard access. Select the text and copy manually.', 'error');
  }

  /** Pulls the token out of a live Discord tab and drops it into the field. */
  async #capture(trigger: HTMLElement): Promise<void> {
    const handle = busy(trigger as HTMLButtonElement, 'Reading tab…');

    try {
      const token = await call<string>({ type: 'token/extract' });
      this.#tokenField.value = token;
      this.#tokenField.dispatchEvent(new Event('input'));
      handle.done();
      toast('Captured the token from your Discord tab.', 'success');
    } catch (error) {
      handle.fail(this.toastError(error));
    }
  }

  /** Validates and stores a token without opening Discord. */
  async #saveOnly(trigger: HTMLElement): Promise<void> {
    const token = this.#readToken();
    if (token === null) return;

    const handle = busy(trigger as HTMLButtonElement, 'Checking…');
    try {
      const account = await call<Account>({ type: 'account/add', token });
      handle.done();
      this.#clearTokenIfWanted();
      toast(`Saved ${account.tag}.`, 'success');
      this.#tab = 'accounts';
      await this.refresh();
    } catch (error) {
      handle.fail(this.toastError(error));
    }
  }

  async #signInFromField(): Promise<void> {
    const token = this.#readToken();
    if (token === null) return;

    const submit = qs<HTMLButtonElement>('[data-submit="login"]');
    const handle = busy(submit, 'Signing in…');

    try {
      const account = await call<Account>({ type: 'token/login', token });
      handle.done();
      this.#clearTokenIfWanted();

      // Add a brief success animation to the Sign in button
      submit.classList.add('success-flash');
      submit.addEventListener('animationend', () => submit.classList.remove('success-flash'), { once: true });

      toast(`Signed in as ${account.displayName}.`, 'success');
      this.#tab = 'accounts';
      await this.refresh();
    } catch (error) {
      handle.fail(this.toastError(error));
    }
  }

  async #signIn(id: string | undefined, trigger: HTMLElement): Promise<void> {
    if (id === undefined) return;
    const handle = busy(trigger as HTMLButtonElement, 'Signing in…');

    try {
      const account = await call<Account>({ type: 'account/login', id });
      handle.done();

      // Visual success flash on the account row
      const row = document.querySelector<HTMLElement>(`[data-account="${id}"]`);
      if (row) {
        row.classList.add('success-flash');
        row.addEventListener('animationend', () => row.classList.remove('success-flash'), { once: true });
      }

      toast(`Signed in as ${account.displayName}.`, 'success');
      await this.refresh();
    } catch (error) {
      handle.done();
      this.toastError(error);
      await this.refresh();
    }
  }
  #openAccountMenu(trigger: HTMLElement, id: string | undefined): void {
    if (id === undefined) return;
    const account = this.#state.accounts.find((candidate) => candidate.id === id);
    if (account === undefined) return;

    const entries: MenuEntry[] = [
      {
        label: 'Check token',
        icon: 'refresh',
        onSelect: async () => {
          try {
            const updated = await call<Account>({ type: 'account/validate', id });
            toast(
              `${updated.tag} is ${updated.status}.`,
              updated.status === 'valid' ? 'success' : 'warning',
            );
          } catch (error) {
            this.toastError(error);
          }
          await this.refresh();
        },
      },
      {
        label: 'Add a note',
        icon: 'pencil',
        onSelect: async () => {
          const note = await promptSheet({
            title: `Note for ${account.displayName}`,
            body: 'A local reminder. Never sent anywhere.',
            value: account.note,
            confirmLabel: 'Save note',
            placeholder: 'e.g. main alt',
          });
          if (note === null) return;
          try {
            await call({ type: 'account/update', id, patch: { note } });
            await this.refresh();
          } catch (error) {
            this.toastError(error);
          }
        },
      },
      {
        label: 'Copy username',
        icon: 'copy',
        onSelect: () => copyToClipboard(account.tag, `Copied ${account.tag}`),
      },
      { separator: true },
      {
        label: 'Remove account',
        icon: 'trash',
        tone: 'danger',
        onSelect: async () => {
          const confirmed = await confirmSheet({
            title: `Remove ${account.displayName}?`,
            body: 'The encrypted token is deleted from this browser.',
            footnote: 'You can add the account again later with the same token.',
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
        },
      },
    ];

    openMenu(trigger, entries);
  }

  async #validateAll(trigger: HTMLElement): Promise<void> {
    const handle = busy(trigger as HTMLButtonElement);
    const progress = document.querySelector<HTMLElement>('[data-slot="validation-progress"]');
    const progressBar = progress?.querySelector<HTMLElement>('.progress__bar');

    if (progress && progressBar) {
      progress.hidden = false;
      progressBar.style.width = '0%';
    }

    try {
      const accounts = await call<Account[]>({ type: 'account/validateAll' });
      const broken = accounts.filter((account) => account.status !== 'valid');

      if (progressBar) {
        progressBar.style.width = '100%';
      }

      toast(
        broken.length === 0
          ? `All ${pluralize(accounts.length, 'token')} responding.`
          : `${broken.length} of ${accounts.length} tokens need attention.`,
        broken.length === 0 ? 'success' : 'warning',
      );
    } catch (error) {
      this.toastError(error);
    } finally {
      handle.done();
      await this.refresh();

      // Hide progress bar after delay
      if (progress) {
        setTimeout(() => {
          progress.hidden = true;
          if (progressBar) progressBar.style.width = '0%';
        }, 800);
      }
    }
  }

  async #logout(): Promise<void> {
    const confirmed = await confirmSheet({
      title: 'Sign out of Discord?',
      body: 'This clears the session from every open Discord tab in this browser.',
      confirmLabel: 'Sign out',
    });
    if (!confirmed) return;

    try {
      const cleared = await call<number>({ type: 'account/logout' });
      toast(
        cleared === 0 ? 'No Discord tabs were signed in.' : 'Signed out of Discord.',
        'success',
      );
    } catch (error) {
      this.toastError(error);
    }
    await this.refresh();
  }

  async #lock(): Promise<void> {
    try {
      await call({ type: 'vault/lock' });
      this.#tab = 'login';
      await this.refresh();
      toast('Vault locked. Tokens stay encrypted at rest.', 'neutral');
    } catch (error) {
      this.toastError(error);
    }
  }

  async #unlock(): Promise<void> {
    const field = qs<HTMLInputElement>('#unlock-pass');
    const errorSlot = qs<HTMLElement>('[data-slot="unlock-error"]');
    const submit = qs<HTMLButtonElement>('[data-submit="unlock"]');

    errorSlot.hidden = true;
    const handle = busy(submit, 'Unlocking…');

    try {
      await call({ type: 'vault/unlock', passphrase: field.value });
      handle.done();
      field.value = '';
      await this.refresh();
    } catch (error) {
      handle.done();
      errorSlot.textContent = this.toastError(error);
      errorSlot.hidden = false;
      field.select();
    }
  }
  /* ----------------------------------------------------------------- utils */

  /** Reads the field, masking the failure mode of an empty paste. */
  #readToken(): string | null {
    const token = this.#tokenField.value.trim();
    if (token.length === 0) {
      toast('Paste a token first.', 'warning');
      this.#tokenField.focus();
      return null;
    }
    return token;
  }

  #clearTokenIfWanted(): void {
    if (!this.#state.settings.clearTokenAfterLogin) return;
    this.#tokenField.value = '';
    this.#syncTokenState();
  }

  #focusTokenIfWanted(): void {
    const { settings, lock } = this.#state;
    if (lock === 'locked' || !settings.focusTokenOnOpen) return;
    if (this.#tab !== 'login') return;
    this.#tokenField.focus();
  }

  /**
   * Consumes whatever a context-menu action left behind. Keeping this in the
   * popup means every action in the app surfaces feedback the same way.
   */
  async #drainHandoff(): Promise<void> {
    try {
      const stored = await chrome.storage.session.get(HANDOFF_KEY);
      const payload = stored[HANDOFF_KEY] as { kind?: string; message?: string } | undefined;
      if (payload?.message === undefined) return;

      await chrome.storage.session.remove(HANDOFF_KEY);
      toast(payload.message, payload.kind === 'error' ? 'error' : 'success');
      if (payload.kind !== 'error') this.#tab = 'accounts';
      this.render();
    } catch (error) {
      log.debug('No handoff to drain', error);
    }
  }

  private toastError(error: unknown): string {
    const message = error instanceof RpcError ? error.message : 'Something went wrong.';
    if (!(error instanceof RpcError)) log.error('Unexpected popup failure', error);
    toast(message, 'error');
    return message;
  }
}

export const controller = new PopupController();

