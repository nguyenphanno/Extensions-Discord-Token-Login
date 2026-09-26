/**
 * Minimal, hand-maintained ambient declarations for the subset of the
 * WebExtension API surface this project actually consumes.
 *
 * Keeping these local means the build is fully deterministic and requires
 * no network access to typecheck. Every declaration below mirrors the
 * official Chrome MV3 documentation.
 */

declare namespace chrome {
  namespace runtime {
    const id: string;
    const lastError: { message?: string } | undefined;

    function getURL(path: string): string;
    function getManifest(): Record<string, unknown>;

    interface MessageSender {
      tab?: tabs.Tab;
      frameId?: number;
      id?: string;
      url?: string;
    }

    interface MessageEvent {
      addListener(
        callback: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
      removeListener(
        callback: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    }

    const onMessage: MessageEvent;
    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };
    const onStartup: { addListener(callback: () => void): void };

    function sendMessage(message: unknown): Promise<unknown>;
    function openOptionsPage(): Promise<void>;
  }

  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }

    const local: StorageArea;
    const session: StorageArea;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      windowId?: number;
      active?: boolean;
      url?: string;
      title?: string;
      status?: string;
      discarded?: boolean;
    }

    interface CreateProperties {
      url?: string;
      active?: boolean;
      windowId?: number;
    }

    interface UpdateProperties {
      url?: string;
      active?: boolean;
      muted?: boolean;
    }

    interface QueryInfo {
      active?: boolean;
      currentWindow?: boolean;
      url?: string | string[];
    }

    function create(props: CreateProperties): Promise<tabs.Tab>;
    function update(tabId: number, props: UpdateProperties): Promise<tabs.Tab | undefined>;
    function remove(tabId: number): Promise<void>;
    function get(tabId: number): Promise<tabs.Tab>;
    function query(info: QueryInfo): Promise<tabs.Tab[]>;
    function reload(tabId: number, properties?: { bypassCache?: boolean }): Promise<void>;

    interface TabChangeInfo {
      status?: string;
      url?: string;
    }

    const onUpdated: {
      addListener(
        callback: (tabId: number, info: TabChangeInfo, tab: tabs.Tab) => void,
      ): void;
    };
    const onRemoved: {
      addListener(callback: (tabId: number) => void): void;
    };
  }

  namespace windows {
    interface CreateData {
      url?: string;
      focused?: boolean;
      type?: string;
    }

    function create(data: CreateData): Promise<{ id?: number; tabs?: tabs.Tab[] }>;
  }

  namespace scripting {
    type InjectionTarget = {
      tabId: number;
      frameIds?: number[];
      documentIds?: string[];
      /** Inject into every frame in the tab. Mutually exclusive with `frameIds`. */
      allFrames?: boolean;
    };

    interface Execution<T> {
      frameId?: number;
      result?: T;
      error?: string;
    }

    /**
     * `world: 'MAIN'` runs inside the page's own JavaScript context, which is
     * the only way to reach page-owned storage such as `localStorage`. The
     * serialised `func` receives its inputs through `args` — it cannot close
     * over anything in the worker's scope. An async function is awaited by the
     * browser, so its resolved value is what lands in `InjectionResult.result`.
     */
    function executeScript<T, A extends readonly unknown[]>(injection: {
      target: InjectionTarget;
      world?: 'ISOLATED' | 'MAIN';
      func: (...args: A) => T | Promise<T>;
      args?: A;
    }): Promise<Array<InjectionResult<Awaited<T>>>>;

    type InjectionResult<T> = Execution<T>;
  }

  namespace contextMenus {
    interface CreateProperties {
      id: string;
      title?: string;
      contexts?: Array<'all' | 'page' | 'action' | 'selection'>;
      enabled?: boolean;
      parentId?: string;
      type?: 'normal' | 'separator';
    }

    interface OnClickData {
      menuItemId: string | number;
      pageUrl?: string;
      selectionText?: string;
    }

    function create(props: CreateProperties): void;
    function removeAll(): Promise<void>;

    const onClicked: {
      addListener(
        callback: (data: OnClickData, tab?: tabs.Tab) => void,
      ): void;
    };
  }

  namespace action {
    interface BadgeDetails {
      text: string;
    }

    function setBadgeText(details: BadgeDetails): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>;
    function setTitle(details: { title: string }): void;
    function setIcon(details: { path: string | Record<string, string> }): Promise<void>;
    function openPopup(): Promise<void>;
  }

  namespace permissions {
    function contains(permissions: {
      permissions?: string[];
      origins?: string[];
    }): Promise<boolean>;
  }
}
