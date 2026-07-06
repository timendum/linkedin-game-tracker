/**
 * Browser Abstraction Module
 *
 * Isolates all browser-specific API calls into a single module that provides
 * a unified interface to the rest of the codebase. Detects the runtime environment
 * and maps chrome.* to browser.* for Firefox compatibility.
 */

// --- Interfaces ---

export interface BrowserStorage {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  getBytesInUse(keys?: string | string[]): Promise<number>;
  QUOTA_BYTES: number;
}

export interface BrowserRuntime {
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: {
    addListener(
      callback: (
        msg: unknown,
        sender: unknown,
        sendResponse: (r: unknown) => void,
      ) => void,
    ): void;
  };
}

export interface BrowserNotifications {
  create(id: string, options: Record<string, unknown>): Promise<string>;
}

export interface BrowserDownloads {
  download(options: Record<string, unknown>): Promise<number>;
}

export interface BrowserAPI {
  storage: BrowserStorage;
  runtime: BrowserRuntime;
  notifications: BrowserNotifications;
  downloads: BrowserDownloads;
}

// --- Environment Detection ---

/** Detect whether the extension is running in a Firefox environment */
function isFirefox(): boolean {
  return typeof globalThis !== "undefined" &&
    "browser" in globalThis &&
    typeof (globalThis as Record<string, unknown>).browser === "object";
}

/** Get the raw browser/chrome global */
// deno-lint-ignore no-explicit-any
function getRawAPI(): any {
  if (isFirefox()) {
    // deno-lint-ignore no-explicit-any
    return (globalThis as any).browser;
  }
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).chrome;
}

// --- Chrome Promise Wrappers ---

/**
 * Wraps a Chrome callback-style API call in a Promise.
 * Chrome MV3 does support promise-based APIs in many cases,
 * but this wrapper ensures consistent behavior across older versions.
 */
// deno-lint-ignore no-explicit-any
function promisify<T>(
  fn: (...args: any[]) => void,
  ...args: any[]
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fn(...args, (result: T) => {
      // deno-lint-ignore no-explicit-any
      const error = (globalThis as any).chrome?.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(result);
      }
    });
  });
}

// --- Chrome/Edge Implementation ---

function createChromeStorage(): BrowserStorage {
  // deno-lint-ignore no-explicit-any
  const api = getRawAPI();
  const storageLocal = api?.storage?.local;

  return {
    get(keys: string | string[]): Promise<Record<string, unknown>> {
      if (storageLocal?.get?.length === 1 || isFirefox()) {
        // Promise-based (MV3 Chrome or Firefox)
        return storageLocal.get(keys);
      }
      return promisify<Record<string, unknown>>(
        storageLocal.get.bind(storageLocal),
        keys,
      );
    },

    set(items: Record<string, unknown>): Promise<void> {
      if (storageLocal?.set?.length === 1 || isFirefox()) {
        return storageLocal.set(items);
      }
      return promisify<void>(storageLocal.set.bind(storageLocal), items);
    },

    getBytesInUse(keys?: string | string[]): Promise<number> {
      if (storageLocal?.getBytesInUse?.length <= 1 || isFirefox()) {
        return storageLocal.getBytesInUse(keys);
      }
      return promisify<number>(
        storageLocal.getBytesInUse.bind(storageLocal),
        keys,
      );
    },

    QUOTA_BYTES: api?.storage?.local?.QUOTA_BYTES ?? 10_485_760, // 10MB default
  };
}

function createChromeRuntime(): BrowserRuntime {
  // deno-lint-ignore no-explicit-any
  const api = getRawAPI();
  const runtime = api?.runtime;

  return {
    sendMessage(message: unknown): Promise<unknown> {
      if (isFirefox()) {
        return runtime.sendMessage(message);
      }
      // Chrome MV3 sendMessage supports promises
      if (runtime?.sendMessage) {
        return promisify<unknown>(
          runtime.sendMessage.bind(runtime),
          message,
        );
      }
      return Promise.reject(new Error("runtime.sendMessage not available"));
    },

    onMessage: {
      addListener(
        callback: (
          msg: unknown,
          sender: unknown,
          sendResponse: (r: unknown) => void,
        ) => void,
      ): void {
        runtime?.onMessage?.addListener(callback);
      },
    },
  };
}

function createChromeNotifications(): BrowserNotifications {
  // deno-lint-ignore no-explicit-any
  const api = getRawAPI();
  const notifications = api?.notifications;

  return {
    create(id: string, options: Record<string, unknown>): Promise<string> {
      if (isFirefox()) {
        return notifications.create(id, options);
      }
      if (notifications?.create) {
        return promisify<string>(
          notifications.create.bind(notifications),
          id,
          options,
        );
      }
      return Promise.reject(new Error("notifications.create not available"));
    },
  };
}

function createChromeDownloads(): BrowserDownloads {
  // deno-lint-ignore no-explicit-any
  const api = getRawAPI();
  const downloads = api?.downloads;

  return {
    download(options: Record<string, unknown>): Promise<number> {
      if (isFirefox()) {
        return downloads.download(options);
      }
      if (downloads?.download) {
        return promisify<number>(
          downloads.download.bind(downloads),
          options,
        );
      }
      return Promise.reject(new Error("downloads.download not available"));
    },
  };
}

// --- Factory ---

function createBrowserAPI(): BrowserAPI {
  return {
    storage: createChromeStorage(),
    runtime: createChromeRuntime(),
    notifications: createChromeNotifications(),
    downloads: createChromeDownloads(),
  };
}

// --- Singleton Export ---

/** Singleton browser API instance for use throughout the codebase */
export const browserAPI: BrowserAPI = createBrowserAPI();
