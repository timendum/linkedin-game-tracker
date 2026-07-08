/// <reference lib="dom" />
/**
 * Result Scraper Content Script
 *
 * Injected on LinkedIn game result pages. Extracts:
 * 1. Friends' results from the connections leaderboard
 * 2. The current user's own result from the "You" row (second source, complementing game-scraper)
 *
 * The user's leaderboard result serves as a backup data source — if the game-scraper
 * fails to capture a result from the game page itself, this scraper can still pick it up
 * from the leaderboard's "You" entry.
 */

import { browserAPI } from "../lib/browser.ts";
import { MessageType } from "../lib/types.ts";
import type { GameSession, GameType, LeaderboardResultsPayload } from "../lib/types.ts";

// --- URL Detection ---

/** Detects the game type from the current page URL */
function detectGameType(url: string): GameType | null {
  const gamePatterns: Record<string, GameType> = {
    "/games/pinpoint": "pinpoint",
    "/games/queens": "queens",
    "/games/crossclimb": "crossclimb",
    "/games/tango": "tango",
    "/games/wend": "wend",
    "/games/patches": "patches",
    "/games/zip": "zip",
    "/games/mini-sudoku": "sudoku",
  };

  for (const [pattern, gameType] of Object.entries(gamePatterns)) {
    if (url.includes(pattern)) {
      return gameType;
    }
  }
  return null;
}

// --- Time Parsing ---

/**
 * Parses time display formats into seconds.
 * Handles: "2:34", "0:34", "1:02:34"
 */
function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== "string") return null;

  const trimmed = timeStr.trim();

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

  return null;
}

// --- Date Helper ---

/** Returns today's date in ISO format */
function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

/** Returns yesterday's date in ISO format */
function getYesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

/**
 * Determines the effective date for the leaderboard currently displayed.
 * LinkedIn's leaderboard page has "Today" and "Yesterday" tabs.
 * If the "Yesterday" tab is selected, returns yesterday's date.
 * Otherwise returns today's date.
 *
 * Checks both the main document and same-origin iframes since LinkedIn
 * may render the leaderboard in either location.
 */
function getLeaderboardDate(docs: Document[]): string {
  for (const doc of docs) {
    const selectedTab = doc.querySelector('[role="tab"][aria-selected="true"]');
    if (selectedTab && selectedTab.textContent?.trim().toLowerCase() === "yesterday") {
      return getYesterdayISO();
    }
  }
  return getTodayISO();
}

// --- ResultScraper Class ---

/**
 * Scraper that extracts results from the connections leaderboard
 * displayed on LinkedIn game result pages, including:
 * - Friend results (sent as FRIENDS_RESULTS)
 * - The current user's own result from the "You" row (sent as GAME_RESULT)
 *
 * The user's result from the leaderboard acts as a second source, complementing
 * the game-scraper. If both capture the same result, the composite key
 * (gameType + date + playerName="self") ensures deduplication in the data store.
 *
 * DOM Structure (observed via Playwright):
 * - Each player row: `.pr-connections-leaderboard-player__container`
 * - Player name: `.pr-connections-leaderboard-player__name`
 * - Score/time: `.pr-connections-leaderboard-player__score`
 * - Pinpoint scores are plain numbers (1-5 guesses)
 * - Time-based scores are "M:SS" format (e.g., "0:31", "2:14")
 * - Incomplete time-based scores show "-:--" — skipped
 * - Current user's row has name "You" — extracted separately as user result
 * - "See more" button (`.pr-connections-leaderboard__see-more-button`) paginates the list
 * - "See full leaderboard" button navigates to the full leaderboard page
 *
 * The scraper keeps observing the DOM so that when the user clicks "See more"
 * or "See full leaderboard", newly rendered friend rows are captured and sent
 * to the service worker incrementally.
 */
class ResultScraper {
  private gameType: GameType;
  private observer: MutationObserver | null = null;
  /** Tracks the currently active tab ("today" | "yesterday") to detect tab switches */
  private lastActiveTab: string | null = null;
  /** Debounce timer for batching DOM mutation callbacks */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Delay in ms to debounce rapid DOM mutations (e.g., "See more" loading multiple rows) */
  private static readonly DEBOUNCE_MS = 800;

  constructor(gameType: GameType) {
    this.gameType = gameType;
  }

  /**
   * Returns all documents to search for leaderboard rows.
   * LinkedIn renders the results page in the main document on direct navigation,
   * but inside a same-origin iframe during SPA (client-side) navigation.
   * We check both to handle either case.
   */
  private getSearchDocuments(): Document[] {
    const docs: Document[] = [document];
    try {
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of iframes) {
        try {
          if (iframe.contentDocument) {
            docs.push(iframe.contentDocument);
          }
        } catch (_e) {
          // Cross-origin iframe — skip
        }
      }
    } catch (_e) {
      // Ignore errors accessing iframes
    }
    return docs;
  }

  /**
   * Extracts visible friend results from the leaderboard DOM.
   * Skips the current user's row (name === "You") — that's handled by extractUserResult.
   * Searches both the main document and any same-origin iframes,
   * since LinkedIn may render the leaderboard in either location
   * depending on whether navigation was a full page load or SPA transition.
   */
  extractFriendsResults(): GameSession[] {
    const results: GameSession[] = [];
    const docs = this.getSearchDocuments();
    const date = getLeaderboardDate(docs);

    for (const doc of docs) {
      const rows = doc.querySelectorAll(
        ".pr-connections-leaderboard-player__container",
      );

      for (const row of rows) {
        const nameEl = row.querySelector(
          ".pr-connections-leaderboard-player__name",
        );
        const scoreEl = row.querySelector(
          ".pr-connections-leaderboard-player__score",
        );

        if (!nameEl || !scoreEl) continue;

        const displayName = nameEl.textContent?.trim() ?? "";
        const scoreText = scoreEl.textContent?.trim() ?? "";

        // Skip the current user's entry (handled separately)
        if (displayName === "You" || displayName === "") continue;

        const result = this.buildFriendSession(displayName, scoreText, date);
        if (result) {
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * Extracts the current user's own result from the "You" row in the leaderboard.
   * Returns a GameSession with playerName="self" if found, or null if not present/incomplete.
   * This serves as a second source for the user's result, complementing game-scraper.
   */
  extractUserResult(): GameSession | null {
    const docs = this.getSearchDocuments();
    const date = getLeaderboardDate(docs);

    for (const doc of docs) {
      const rows = doc.querySelectorAll(
        ".pr-connections-leaderboard-player__container",
      );

      for (const row of rows) {
        const nameEl = row.querySelector(
          ".pr-connections-leaderboard-player__name",
        );
        const scoreEl = row.querySelector(
          ".pr-connections-leaderboard-player__score",
        );

        if (!nameEl || !scoreEl) continue;

        const displayName = nameEl.textContent?.trim() ?? "";
        if (displayName !== "You") continue;

        const scoreText = scoreEl.textContent?.trim() ?? "";

        // Skip incomplete results
        if (
          !scoreText ||
          scoreText === "–" ||
          scoreText === "-" ||
          scoreText === "—" ||
          scoreText === "-:--"
        ) {
          return null;
        }

        return this.buildUserSession(scoreText, date);
      }
    }

    return null;
  }

  /**
   * Checks if the full leaderboard is visible or truncated.
   * Two indicators of a partial view:
   * - "See full leaderboard" button (on game results page — only top 3 shown)
   * - "See more" button (on full leaderboard page — paginated list)
   * The buttons don't have aria-labels — detection is based on text content and class.
   * Checks both main document and iframes.
   */
  isLeaderboardPartial(): boolean {
    for (const doc of this.getSearchDocuments()) {
      // Check for "See full leaderboard" button (results page → full leaderboard)
      const buttons = doc.querySelectorAll("button");
      for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() ?? "";
        if (text.includes("see full leaderboard")) {
          return true;
        }
      }

      // Check for "See more" button (paginated full leaderboard)
      const seeMoreBtn = doc.querySelector(
        ".pr-connections-leaderboard__see-more-button",
      );
      if (seeMoreBtn) {
        return true;
      }
    }

    return false;
  }

  /**
   * Starts observing the DOM for the leaderboard to appear and for new rows
   * added after "See more" clicks.
   * The leaderboard may load asynchronously after the page renders.
   * Also observes same-origin iframes, since LinkedIn renders the results
   * page inside an iframe during SPA (client-side) navigation.
   */
  observe(): void {
    // First, check if the leaderboard is already present
    this.checkAndExtract();

    // Set up MutationObserver on main document to detect when leaderboard renders or expands
    this.observer = new MutationObserver((_mutations: MutationRecord[]) => {
      this.debouncedCheckAndExtract();
      // Also watch for new iframes being added
      this.observeIframes();
    });

    const target = document.body;
    if (target) {
      this.observer.observe(target, {
        childList: true,
        subtree: true,
      });
    }

    // Observe any iframes already present
    this.observeIframes();
  }

  /** Set of iframe elements we've already attached observers to */
  private observedIframes: WeakSet<HTMLIFrameElement> = new WeakSet();
  /** MutationObservers attached to iframe documents */
  private iframeObservers: MutationObserver[] = [];

  /**
   * Finds same-origin iframes and attaches MutationObservers to their
   * content documents so we can detect leaderboard rows rendering inside them.
   */
  private observeIframes(): void {
    const iframes = document.querySelectorAll("iframe");
    for (const iframe of iframes) {
      if (this.observedIframes.has(iframe)) continue;
      this.observedIframes.add(iframe);

      const attachObserver = () => {
        try {
          const iframeDoc = iframe.contentDocument;
          if (!iframeDoc || !iframeDoc.body) return;

          const iframeObs = new MutationObserver(() => {
            this.debouncedCheckAndExtract();
          });
          iframeObs.observe(iframeDoc.body, {
            childList: true,
            subtree: true,
          });
          this.iframeObservers.push(iframeObs);

          // Immediately check in case rows are already present
          this.debouncedCheckAndExtract();
        } catch (_e) {
          // Cross-origin iframe — skip
        }
      };

      // If iframe is already loaded, attach now; otherwise wait for load
      if (iframe.contentDocument && iframe.contentDocument.body) {
        attachObserver();
      }
      iframe.addEventListener("load", attachObserver);
    }
  }

  /**
   * Debounces checkAndExtract to avoid firing on every individual DOM node
   * that gets added during a batch "See more" load.
   */
  private debouncedCheckAndExtract(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.checkAndExtract();
    }, ResultScraper.DEBOUNCE_MS);
  }

  /**
   * Checks if leaderboard rows are present and extracts/reports NEW results.
   * Keeps observing — does not disconnect after first extraction.
   * This allows capturing additional friends loaded via "See more".
   * Searches both main document and same-origin iframes.
   * Resets reported names when the active tab changes (Today ↔ Yesterday).
   *
   * Extracts both friends and the user's own result, then sends them in a
   * single LEADERBOARD_RESULTS message to avoid race conditions in the data store.
   */
  private checkAndExtract(): void {
    const docs = this.getSearchDocuments();

    // Detect active tab to handle Today ↔ Yesterday switches
    let activeTab: string | null = null;
    for (const doc of docs) {
      const selectedTab = doc.querySelector('[role="tab"][aria-selected="true"]');
      if (selectedTab) {
        activeTab = selectedTab.textContent?.trim().toLowerCase() ?? null;
        break;
      }
    }

    // Track tab switches so we know when the date context changes
    if (activeTab !== null && activeTab !== this.lastActiveTab) {
      this.lastActiveTab = activeTab;
    }

    let totalRows = 0;
    for (const doc of docs) {
      const rows = doc.querySelectorAll(
        ".pr-connections-leaderboard-player__container",
      );
      totalRows += rows.length;
    }

    // Need at least one row to proceed (even if it's just "You")
    if (totalRows === 0) return;

    // --- Gather user result and friends ---
    const userSession = this.extractUserResult();
    const friendSessions = this.extractFriendsResults();

    // Only send if we have something to report
    if (userSession || friendSessions.length > 0) {
      this.reportLeaderboardResults(userSession, friendSessions);
    }
  }

  /**
   * Sends both the user's result and friends' results in a single message
   * to the service worker. This avoids the race condition where concurrent
   * saveSession calls for the same game-type shard overwrite each other.
   * Retries once after 500ms if sendMessage fails.
   */
  private async reportLeaderboardResults(
    userSession: GameSession | null,
    friendSessions: GameSession[],
  ): Promise<void> {
    const payload: LeaderboardResultsPayload = { userSession, friendSessions };
    const message = {
      type: MessageType.LEADERBOARD_RESULTS,
      payload,
    };
    console.log("LinkedIn Games Tracker: sending leaderboard results", payload);

    try {
      await browserAPI.runtime.sendMessage(message);
    } catch (_error) {
      // Retry once after 500ms delay
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        await browserAPI.runtime.sendMessage(message);
      } catch (_retryError) {
        console.error(
          "LinkedIn Games Tracker: Failed to send leaderboard results to service worker after retry",
        );
      }
    }
  }

  /**
   * Builds a GameSession from a friend's extracted DOM data.
   * Returns the correct discriminated union variant based on game type.
   * Returns null for non-playing friends or incomplete games:
   * - Pinpoint: score "–" (en-dash) means didn't complete
   * - Time-based: score "-:--" means started but didn't finish
   */
  private buildFriendSession(
    displayName: string,
    scoreText: string,
    date: string,
  ): GameSession | null {
    // Skip friends who haven't completed:
    // - "–" (en-dash): Pinpoint player who didn't finish
    // - "-" or "—": alternative dash characters
    // - "-:--": time-based player who didn't finish
    if (
      !scoreText ||
      scoreText === "–" ||
      scoreText === "-" ||
      scoreText === "—" ||
      scoreText === "-:--"
    ) {
      return null;
    }

    const scrapedAt = new Date().toISOString();

    if (this.gameType === "pinpoint") {
      // Pinpoint scores are plain numbers (1-6 guesses)
      const score = parseInt(scoreText, 10);
      if (isNaN(score) || score < 1 || score > 6) return null;
      return {
        gameType: "pinpoint",
        date,
        playerName: displayName,
        completed: true,
        scrapedAt,
        score,
      };
    }

    // Time-based games: score is in "M:SS" format
    const completionTime = parseTimeToSeconds(scoreText);
    if (completionTime === null || completionTime <= 0) return null;

    return {
      gameType: this.gameType as Exclude<GameType, "pinpoint">,
      date,
      playerName: displayName,
      completed: true,
      scrapedAt,
      completionTime,
    };
  }

  /**
   * Builds a GameSession from the user's leaderboard score.
   * Uses playerName="self" to match the game-scraper convention,
   * ensuring deduplication via composite key.
   */
  private buildUserSession(scoreText: string, date: string): GameSession | null {
    const scrapedAt = new Date().toISOString();

    if (this.gameType === "pinpoint") {
      const score = parseInt(scoreText, 10);
      if (isNaN(score) || score < 1 || score > 6) return null;
      return {
        gameType: "pinpoint",
        date,
        playerName: "self",
        completed: true,
        scrapedAt,
        score,
      };
    }

    // Time-based games
    const completionTime = parseTimeToSeconds(scoreText);
    if (completionTime === null || completionTime <= 0) return null;

    return {
      gameType: this.gameType as Exclude<GameType, "pinpoint">,
      date,
      playerName: "self",
      completed: true,
      scrapedAt,
      completionTime,
    };
  }

  /** Disconnects the MutationObserver and stops monitoring */
  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    for (const obs of this.iframeObservers) {
      obs.disconnect();
    }
    this.iframeObservers = [];
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

// --- SPA Navigation Monitor ---

/**
 * Monitors LinkedIn SPA navigation and (re-)initializes the result scraper
 * whenever the user lands on a game page.
 */
class ResultNavigationMonitor {
  private currentScraper: ResultScraper | null = null;
  private currentGameType: GameType | null = null;
  private lastUrl: string = "";
  private pollTimer: ReturnType<typeof setInterval> | null = null;
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
    }, ResultNavigationMonitor.POLL_INTERVAL_MS);
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

    if (gameType === this.currentGameType && this.currentScraper) {
      return;
    }

    this.destroyCurrent();

    if (!gameType) {
      return;
    }

    console.log(`LinkedIn Games Tracker: result scraper activated for ${gameType}`);
    this.currentGameType = gameType;
    this.currentScraper = new ResultScraper(gameType);
    this.currentScraper.observe();
  }

  private destroyCurrent(): void {
    if (this.currentScraper) {
      this.currentScraper.destroy();
      this.currentScraper = null;
    }
    this.currentGameType = null;
  }

  destroy(): void {
    this.destroyCurrent();
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

// --- Initialization ---

const resultMonitor = new ResultNavigationMonitor();
resultMonitor.start();
