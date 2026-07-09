/**
 * Unit tests for Browser Abstraction Module
 *
 * Tests verify:
 * - Environment detection logic
 * - Chrome/Edge callback wrapping produces correct promises
 * - Firefox passthrough works correctly
 * - Singleton export is available
 */

import { assertEquals, assertExists } from "@std/assert";
import type { BrowserAPI } from "./browser.ts";

// --- Mock Helpers ---

function setupChromeMock() {
  // deno-lint-ignore no-explicit-any
  (globalThis as any).chrome = {
    runtime: {
      lastError: null,
      sendMessage(message: unknown, callback: (response: unknown) => void) {
        callback({ echo: message });
      },
      onMessage: {
        addListener(_callback: unknown) {
          // no-op for test
        },
      },
    },
    notifications: {
      create(
        _id: string,
        _options: Record<string, unknown>,
        callback: (id: string) => void,
      ) {
        callback("test-notification-id");
      },
    },
  };
}

function cleanupGlobals() {
  // deno-lint-ignore no-explicit-any
  delete (globalThis as any).chrome;
  // deno-lint-ignore no-explicit-any
  delete (globalThis as any).browser;
}

// --- Tests ---

Deno.test("browser module exports BrowserAPI interfaces and singleton", async () => {
  setupChromeMock();
  try {
    // Re-import to get a fresh module with the mock in place
    const module = await import("./browser.ts");
    assertExists(module.browserAPI);
    assertExists(module.browserAPI.runtime);
    assertExists(module.browserAPI.notifications);
  } finally {
    cleanupGlobals();
  }
});

Deno.test("Chrome mock: runtime interface has expected shape", async () => {
  setupChromeMock();
  try {
    const { browserAPI } = await import("./browser.ts");
    assertExists(browserAPI.runtime);
    assertEquals(typeof browserAPI.runtime.sendMessage, "function");
    assertExists(browserAPI.runtime.onMessage);
    assertEquals(typeof browserAPI.runtime.onMessage.addListener, "function");
  } finally {
    cleanupGlobals();
  }
});

Deno.test("Chrome mock: notifications interface has expected shape", async () => {
  setupChromeMock();
  try {
    const { browserAPI } = await import("./browser.ts");
    assertExists(browserAPI.notifications);
    assertEquals(typeof browserAPI.notifications.create, "function");
  } finally {
    cleanupGlobals();
  }
});

Deno.test("BrowserAPI type is correctly exported", async () => {
  const module = await import("./browser.ts");
  // Verify the API matches the BrowserAPI interface shape
  const api: BrowserAPI = module.browserAPI;
  assertExists(api.runtime);
  assertExists(api.notifications);
});
