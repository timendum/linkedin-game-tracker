/**
 * Service Worker Entry Point
 *
 * Registers message handlers on startup and logs installation events.
 * In Manifest V3, listeners must be registered synchronously at the top level
 * since the service worker can be terminated and restarted at any time.
 */

import { registerHandlers } from "./message-controller.ts";

// Register all message handlers at the top level so they persist
// across service worker restarts.
registerHandlers();

// Log when the extension is first installed or updated.
// deno-lint-ignore no-explicit-any
const chromeAPI = (globalThis as any).chrome;
chromeAPI?.runtime?.onInstalled?.addListener(
  (details: { reason: string }) => {
    console.log(`LinkedIn Games Tracker: installed (${details.reason})`);
  },
);
