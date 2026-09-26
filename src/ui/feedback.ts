/**
 * Shared interaction feedback: toasts, confirmation sheets and busy buttons.
 *
 * Feedback is deliberately *local* to the extension — no OS notifications, no
 * network round trip — so a token paste never produces an artefact outside the
 * browser that a shoulder-surfer or a screenshot could pick up.
 */

import { TIMING } from '../core/constants';
import { el, on } from './dom';
import { icon, type IconName } from './icons';

export type ToastTone = 'neutral' | 'success' | 'error' | 'warning';

const TONE_ICON: Record<ToastTone, IconName> = {
  neutral: 'info',
  success: 'checkCircle',
  error: 'warning',
  warning: 'warning',
};

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */
/* -------------------------------------------------------------------------- */

let toastHost: HTMLElement | null = null;

function ensureToastHost(): HTMLElement {
  if (toastHost !== null && toastHost.isConnected) return toastHost;
  const existing = document.querySelector<HTMLElement>('[data-toast-host]');
  if (existing !== null) {
    toastHost = existing;
    return existing;
  }

  const host = el('div', {
    class: 'toast-host',
    'data-toast-host': '',
    role: 'status',
    'aria-live': 'polite',
  });
  document.body.append(host);
  toastHost = host;
  return host;
}

export function toast(message: string, tone: ToastTone = 'neutral', ms: number = TIMING.TOAST_MS): void {
  const host = ensureToastHost();

  // Toast progress bar for auto-dismiss countdown
  const progressBar = el('div', {
    class: 'toast__progress',
    style: `position:absolute;bottom:0;left:0;height:2px;width:100%;background:currentColor;opacity:0.2;border-radius:0 0 var(--radius-lg) var(--radius-lg);transform-origin:left;animation:toast-progress ${ms}ms linear forwards`,
  });

  const node = el('div', { class: `toast toast--${tone}`, role: 'alert', style: 'position:relative;overflow:hidden' }, [
    el('span', { class: 'toast__glyph' }, [icon(TONE_ICON[tone], { size: 20 })]),
    el('span', { class: 'toast__text', text: message }),
  ]);

  const dismiss = (): void => {
    node.classList.add('toast--leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  };

  const closeButton = el('button', {
    class: 'toast__close',
    type: 'button',
    'aria-label': 'Dismiss notification',
  });
  closeButton.append(icon('close', { size: 16 }));
  on(closeButton, 'click', dismiss);
  node.append(closeButton);
  node.append(progressBar);

  host.append(node);
  setTimeout(dismiss, ms);
}

// Inject toast progress animation CSS
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `@keyframes toast-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }`;
  document.head.appendChild(style);
}

/* -------------------------------------------------------------------------- */
/* Busy buttons                                                                */
/* -------------------------------------------------------------------------- */

export interface BusyHandle {
  done(): void;
  fail(message: string): void;
}

/**
 * Puts a button into a pending state and returns a restore handle. Disabling
 * alone is not enough — the label has to change, or a slow request reads the
 * same as a dead click.
 */
export function busy<T extends HTMLButtonElement>(button: T, label?: string): BusyHandle {
  const original = button.innerHTML;
  button.disabled = true;
  button.classList.add('is-busy');
  button.setAttribute('aria-busy', 'true');

  if (label !== undefined) {
    button.replaceChildren(
      el('span', { class: 'spinner', 'aria-hidden': 'true' }),
      document.createTextNode(label),
    );
  }

  const restore = (): void => {
    button.disabled = false;
    button.classList.remove('is-busy');
    button.removeAttribute('aria-busy');
    if (label !== undefined) button.innerHTML = original;
  };

  return {
    done: restore,
    fail: (message: string) => {
      restore();
      toast(message, 'error');
    },
  };
}
/* -------------------------------------------------------------------------- */
/* Confirmation sheet                                                          */
/* -------------------------------------------------------------------------- */

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  /** Optional second line describing what cannot be undone. */
  footnote?: string;
}

/**
 * A modal that replaces `window.confirm`. Returns a promise so call sites read
 * as linear flow, and traps focus so keyboard users cannot tab into the page
 * behind the sheet.
 */
export function confirmSheet(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;

    const toneIcon = options.tone === 'danger' ? 'warning' : 'info';
    const toneColor = options.tone === 'danger' ? 'var(--danger)' : 'var(--brand)';

    const iconHeader = el('div', {
      style: `display:grid;place-items:center;width:48px;height:48px;border-radius:var(--radius-lg);background:${options.tone === 'danger' ? 'var(--danger-quiet)' : 'var(--brand-quiet)'};margin-bottom:var(--space-4);color:${toneColor}`,
    }, [icon(toneIcon as IconName, { size: 24 })]);

    const confirmButton = el(
      'button',
      {
        class: `btn btn--${options.tone === 'danger' ? 'danger' : 'primary'}`,
        type: 'button',
      },
      [options.confirmLabel],
    );
    const cancelButton = el('button', { class: 'btn btn--ghost', type: 'button' }, ['Cancel']);

    const dialog = el('div', { class: 'sheet__panel', role: 'alertdialog', 'aria-modal': 'true' }, [
      iconHeader,
      el('h2', { class: 'sheet__title', text: options.title }),
      el('p', { class: 'sheet__body', text: options.body }),
      ...(options.footnote === undefined ? [] : [el('p', { class: 'sheet__footnote', text: options.footnote })]),
      el('div', { class: 'sheet__actions' }, [cancelButton, confirmButton]),
    ]);

    const scrim = el('div', { class: 'sheet' }, [dialog]);
    scrim.addEventListener('click', (event) => {
      if (event.target === scrim) finish(false);
    });

    function finish(result: boolean): void {
      document.removeEventListener('keydown', onKey, true);
      scrim.classList.add('sheet--leaving');
      setTimeout(() => scrim.remove(), 180);
      previous?.focus();
      resolve(result);
    }

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable: HTMLElement[] = [cancelButton, confirmButton];
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? index - 1 : index + 1;
      const target = focusable[(next + focusable.length) % focusable.length];
      if (target !== undefined) {
        event.preventDefault();
        target.focus();
      }
    }

    on(cancelButton, 'click', () => finish(false));
    on(confirmButton, 'click', () => finish(true));
    document.addEventListener('keydown', onKey, true);

    document.body.append(scrim);
    confirmButton.focus();
  });
}

/* -------------------------------------------------------------------------- */
/* Prompt sheet                                                                */
/* -------------------------------------------------------------------------- */

export interface PromptOptions {
  title: string;
  body?: string;
  value?: string;
  placeholder?: string;
  confirmLabel: string;
  maxLength?: number;
}

/** Single-field modal. Resolves to the trimmed value, or `null` if cancelled. */
export function promptSheet(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;

    const iconHeader = el('div', {
      style: 'display:grid;place-items:center;width:48px;height:48px;border-radius:var(--radius-lg);background:var(--brand-quiet);margin-bottom:var(--space-4);color:var(--brand)',
    }, [icon('pencil' as IconName, { size: 24 })]);

    const field = el('textarea', {
      class: 'input',
      rows: 3,
      maxlength: options.maxLength ?? 140,
      placeholder: options.placeholder ?? '',
      'aria-label': options.title,
    });
    field.value = options.value ?? '';

    // Character counter
    const maxLen = options.maxLength ?? 140;
    const counter = el('span', {
      class: 'field__hint',
      text: `${(options.value ?? '').length}/${maxLen}`,
      style: 'text-align:right;margin-top:var(--space-1)',
    });
    field.addEventListener('input', () => {
      counter.textContent = `${field.value.length}/${maxLen}`;
      counter.style.color = field.value.length > maxLen * 0.9 ? 'var(--warning)' : '';
    });

    const confirmButton = el('button', { class: 'btn btn--primary', type: 'button' }, [
      options.confirmLabel,
    ]);
    const cancelButton = el('button', { class: 'btn btn--ghost', type: 'button' }, ['Cancel']);

    const panel = el('div', { class: 'sheet__panel', role: 'dialog', 'aria-modal': 'true' }, [
      iconHeader,
      el('h2', { class: 'sheet__title', text: options.title }),
      ...(options.body === undefined ? [] : [el('p', { class: 'sheet__body', text: options.body })]),
      el('div', { class: 'stack', style: 'margin-top:16px' }, [field, counter]),
      el('div', { class: 'sheet__actions' }, [cancelButton, confirmButton]),
    ]);

    const scrim = el('div', { class: 'sheet' }, [panel]);
    scrim.addEventListener('click', (event) => {
      if (event.target === scrim) finish(null);
    });

    function finish(value: string | null): void {
      document.removeEventListener('keydown', onKey, true);
      scrim.classList.add('sheet--leaving');
      setTimeout(() => scrim.remove(), 180);
      previous?.focus();
      resolve(value);
    }

    function submit(): void {
      const value = field.value.trim();
      finish(value.length === 0 ? null : value);
    }

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submit();
      }
    }

    on(cancelButton, 'click', () => finish(null));
    on(confirmButton, 'click', submit);
    document.addEventListener('keydown', onKey, true);

    document.body.append(scrim);
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  });
}

/* -------------------------------------------------------------------------- */
/* Clipboard                                                                   */
/* -------------------------------------------------------------------------- */

export async function copyToClipboard(value: string, successMessage = 'Copied'): Promise<void> {
  if (await tryCopy(value)) {
    toast(successMessage, 'success', 1_800);
  } else {
    toast('Could not access the clipboard.', 'error');
  }
}

/**
 * Copies without any UI feedback, reporting whether it worked. Used where the
 * caller needs to react to the outcome — retry, or explain what to do instead.
 */
export async function tryCopy(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
