/// <reference lib="dom" />
/**
 * Shared utilities for content scripts (game-scraper and result-scraper).
 *
 * Consolidates duplicated logic:
 * - Time string parsing
 * - Date helpers (today/yesterday ISO)
 * - SPA navigation monitoring base class
 */

import { GAME_URL_PATHS } from "../lib/types.ts";
import type { GameType } from "../lib/types.ts";

// --- URL Detection ---

/**
 * Detects the game type from a URL string by matching against known path patterns.
 * Returns null if the URL doesn't match any known game.
 */
export function detectGameType(url: string): GameType | null {
  for (const [pattern, gameType] of Object.entries(GAME_URL_PATHS)) {
    if (url.includes(pattern)) {
      return gameType;
    }
  }
  return null;
}

// --- Time Parsing ---

/**
 * Parses various time display formats into seconds.
 * Handles:
 * - "2:34" (M:SS)
 * - "0:34" (M:SS with zero minutes)
 * - "1:02:34" (H:MM:SS)
 * - "2m 34s", "2m", "34s" (verbose)
 * - "134" (plain number = seconds)
 */
export function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== "string") return null;

  const trimmed = timeStr.trim();

  // Format: "Xm Ys" or "Xm" or "Ys"
  const minsSecsMatch = trimmed.match(/^(?:(\d+)m)?\s*(?:(\d+)s)?$/);
  if (minsSecsMatch && (minsSecsMatch[1] || minsSecsMatch[2])) {
    const mins = parseInt(minsSecsMatch[1] || "0", 10);
    const secs = parseInt(minsSecsMatch[2] || "0", 10);
    return mins * 60 + secs;
  }

  // Format: "H:MM:SS" or "M:SS" or "0:SS"
  const colonMatch = trimmed.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (colonMatch) {
    if (colonMatch[3]) {
      // H:MM:SS
      const hours = parseInt(colonMatch[1], 10);
      const mins = parseInt(colonMatch[2], 10);
      const secs = parseInt(colonMatch[3], 10);
      return hours * 3600 + mins * 60 + secs;
    }
    // M:SS
    const mins = parseInt(colonMatch[1], 10);
    const secs = parseInt(colonMatch[2], 10);
    return mins * 60 + secs;
  }

  // Plain number (seconds)
  const plainNum = parseInt(trimmed, 10);
  if (!isNaN(plainNum) && plainNum > 0) {
    return plainNum;
  }

  return null;
}

// --- Date Helpers ---

/** Returns today's date in ISO format (YYYY-MM-DD) */
export function getTodayISO(): string {
  return Temporal.Now.plainDateISO().toString();
}

/** Returns yesterday's date in ISO format (YYYY-MM-DD) */
export function getYesterdayISO(): string {
  return Temporal.Now.plainDateISO().subtract({ days: 1 }).toString();
}

// --- SPA Navigation Monitor ---

/**
 * Abstract base class for SPA navigation monitors.
 *
 * Both content scripts need to detect LinkedIn SPA navigations and
 * (re-)initialize their scraper when the user lands on a game page.
 * This base class provides the shared navigation detection machinery:
 * - history.pushState/replaceState patching
 * - popstate listener
 * - URL polling fallback
 *
 * Subclasses implement `onGamePage` and `onNonGamePage` to control
 * what happens when navigation is detected.
 */
export abstract class NavigationMonitorBase {
  private lastUrl: string = "";
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  protected currentGameType: GameType | null = null;
  private static readonly POLL_INTERVAL_MS = 500;

  start(): void {
    this.lastUrl = globalThis.location.href;
    this.handleNavigation();

    this.patchHistory("pushState");
    this.patchHistory("replaceState");

    globalThis.addEventListener("popstate", () => this.handleNavigation());

    this.pollTimer = setInterval(() => {
      if (globalThis.location.href !== this.lastUrl) {
        this.lastUrl = globalThis.location.href;
        this.handleNavigation();
      }
    }, NavigationMonitorBase.POLL_INTERVAL_MS);
  }

  private patchHistory(method: "pushState" | "replaceState"): void {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<typeof history.pushState>) => {
      const result = original(...args);
      this.handleNavigation();
      return result;
    };
  }

  private handleNavigation(): void {
    const url = globalThis.location.href;
    this.lastUrl = url;
    const gameType = detectGameType(url);

    if (gameType === this.currentGameType && this.isScraperActive()) {
      return;
    }

    const wasActive = this.isScraperActive();
    this.destroyScraper();

    if (!gameType) {
      this.currentGameType = null;
      return;
    }

    this.currentGameType = gameType;
    this.createScraper(gameType, wasActive);
  }

  /** Returns true if a scraper is currently active */
  protected abstract isScraperActive(): boolean;

  /**
   * Creates and starts a new scraper for the given game type.
   * @param gameType The detected game type
   * @param wasActive Whether a previous scraper was active (SPA nav between games)
   */
  protected abstract createScraper(gameType: GameType, wasActive: boolean): void;

  /** Destroys the current scraper and cleans up */
  protected abstract destroyScraper(): void;

  destroy(): void {
    this.destroyScraper();
    this.currentGameType = null;
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
