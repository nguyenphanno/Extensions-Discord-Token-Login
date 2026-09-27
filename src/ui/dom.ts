/** Tiny DOM helpers. Deliberately not a framework — the popup has one screen. */

type Attrs = Record<string, string | number | boolean | undefined>;

/**
 * Creates an element with attributes, classes and children in one call.
 * `text` sets textContent; `html` is only ever fed our own icon markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { class?: string; text?: string; html?: string } & Attrs = {},
  children: Array<Node | string | null | undefined> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: className, text, html, ...attrs } = options;

  if (className !== undefined) node.className = className;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(key, value === true ? '' : String(value));
  }
  if (text !== undefined) node.textContent = text;
  if (html !== undefined) node.innerHTML = html;

  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  return node;
}

export function qs<T extends Element = HTMLElement>(
  selector: string,
  scope: ParentNode = document,
): T {
  const found = scope.querySelector<T>(selector);
  if (found === null) throw new Error(`Required element not found: ${selector}`);
  return found;
}

export function qsa<T extends Element = HTMLElement>(
  selector: string,
  scope: ParentNode = document,
): T[] {
  return Array.from(scope.querySelectorAll<T>(selector));
}

/** Adds a listener and returns its disposer, so views can clean up in one line. */
export function on<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): () => void {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}

/** Resolves when the element matches, so a popup can wait for real content. */
export function ready(selector: string, timeoutMs = 3_000): Promise<HTMLElement> {
  const existing = document.querySelector<HTMLElement>(selector);
  if (existing !== null) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null) return;
      observer.disconnect();
      resolve(node);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeoutMs);
  });
}
