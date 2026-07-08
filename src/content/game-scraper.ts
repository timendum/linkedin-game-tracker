/// <reference lib="dom" />
/**
 * Game Result DOM Scraper Content Script
 *
 * Injected on LinkedIn game result pages. Observes DOM for completion state,
 * extracts game results, and sends them to the service worker.
 */

import { browserAPI } from "../lib/browser.ts";
import { MessageType } from "../lib/types.ts";
import type { GameSession, GameType } from "../lib/types.ts";
import {
  detectGameType,
  getTodayISO,
  NavigationMonitorBase,
  parseTimeToSeconds,
} from "./shared.ts";

// --- Types ---

interface GameExtractor {
  /** Extracts the performance metric (guesses for Pinpoint, time in seconds for others) */
  extractMetric(doc: Document): number | null;
  /** Extracts the game date as ISO string */
  extractDate(doc: Document): string | null;
  /** Extracts whether the game was completed successfully */
  extractStatus(doc: Document): boolean | null;
}

// --- Common Extraction Helpers ---

/**
 * Searches for the completion time in the DOM.
 * LinkedIn games display time in a span with aria-label pattern "X minutes Y seconds".
 * The text content uses "M:SS" format.
 */
function extractTimeFromDOM(doc: Document): number | null {
  // Primary: aria-label containing minutes/seconds pattern (most reliable)
  const timerEl = doc.querySelector(
    '[aria-label*="minutes"][aria-label*="seconds"]',
  );
  if (timerEl) {
    // aria-label format: " X minutes Y seconds"
    const ariaLabel = timerEl.getAttribute("aria-label") || "";
    const ariaMatch = ariaLabel.match(/(\d+)\s*minutes?\s*(\d+)\s*seconds?/);
    if (ariaMatch) {
      const mins = parseInt(ariaMatch[1], 10);
      const secs = parseInt(ariaMatch[2], 10);
      return mins * 60 + secs;
    }
    // Fallback: parse the text content (format "M:SS")
    if (timerEl.textContent) {
      const time = parseTimeToSeconds(timerEl.textContent.trim());
      if (time !== null && time > 0) return time;
    }
  }

  // Fallback: look for spans with M:SS text that sit near a Clock icon
  const clockIcon = doc.querySelector('[aria-label="Clock"]');
  if (clockIcon) {
    const container = clockIcon.parentElement;
    if (container) {
      const spans = container.querySelectorAll("span");
      for (const span of spans) {
        const text = span.textContent?.trim();
        if (text && /^\d+:\d{2}$/.test(text)) {
          const time = parseTimeToSeconds(text);
          if (time !== null && time > 0) return time;
        }
      }
    }
  }

  // Last resort: scan all spans for M:SS format within toolbar
  const toolbar = doc.querySelector('[role="toolbar"]');
  if (toolbar) {
    const spans = toolbar.querySelectorAll("span");
    for (const span of spans) {
      const text = span.textContent?.trim();
      if (text && /^\d+:\d{2}$/.test(text)) {
        const time = parseTimeToSeconds(text);
        if (time !== null && time > 0) return time;
      }
    }
  }

  return null;
}

/**
 * Extracts the game date from the DOM.
 * LinkedIn games don't typically show an explicit date element — the puzzle
 * is always for "today". We use the current date as the reliable source.
 */
function extractDateFromDOM(_doc: Document): string | null {
  // LinkedIn games are daily puzzles — the game page is always "today's" game.
  // There's no explicit date element rendered on the page.
  return getTodayISO();
}

/**
 * Extracts completion status from the DOM.
 * A game is considered complete when:
 * - A "See results" link (a[href*="/results"]) is present (newer game UI), OR
 * - A "See results" button inside .games-share-footer is present (Ember-based games)
 *
 * Returns true if completed, null if not yet finished.
 */
function extractStatusFromDOM(doc: Document): boolean | null {
  // Newer games (Queens, Tango, Zip, Wend, Patches): "See results" as <a> link
  const resultsLink = doc.querySelector('a[href*="/results"]');
  if (resultsLink) {
    return true;
  }

  // Ember-based games (Mini Sudoku, Crossclimb, Pinpoint): "See results" as <button>
  const shareFooter = doc.querySelector(".games-share-footer");
  if (shareFooter) {
    const btn = shareFooter.querySelector(".games-share-footer__share-btn");
    if (btn && btn.textContent?.trim().includes("See results")) {
      return true;
    }
  }

  // No completion indicator found — game is still in progress
  return null;
}

// --- Game-Specific Extractors ---

/** Creates a time-based game extractor (Queens, Crossclimb, Tango, Wend, Patches, Zip, Sudoku) */
function createTimeBasedExtractor(): GameExtractor {
  return {
    extractMetric(doc: Document): number | null {
      return extractTimeFromDOM(doc);
    },
    extractDate(doc: Document): string | null {
      return extractDateFromDOM(doc);
    },
    extractStatus(doc: Document): boolean | null {
      return extractStatusFromDOM(doc);
    },
  };
}

const extractors: Record<GameType, GameExtractor> = {
  pinpoint: {
    extractMetric(doc: Document): number | null {
      // Pinpoint score = number of clues the player revealed before guessing correctly.
      // Cards revealed only at the end (after solving) get class "pinpoint__card--flip-end".
      // Cards seen during play do NOT have that class.
      // Score = total flipped cards - cards with flip-end class.
      const allFlipped = doc.querySelectorAll(".pinpoint__card__container.flipped");
      const flipEndCards = doc.querySelectorAll(".pinpoint__card--flip-end");

      if (allFlipped.length === 5) {
        const score = 5 - flipEndCards.length;
        if (score >= 1 && score <= 5) return score;
      }

      // Fallback: read from localStorage game state
      // Key pattern: play:urn:li:fsd_game:(...,1,XXX) — gameTypeId 1 = Pinpoint
      try {
        const keys = Object.keys(localStorage);
        const pinpointKey = keys.find(
          (k) => /play:urn:li:fsd_game:\([^,]+,1,\d+\)$/.test(k),
        );
        if (pinpointKey) {
          const raw = localStorage.getItem(pinpointKey);
          if (raw) {
            const wrapper = JSON.parse(raw);
            const data = JSON.parse(wrapper.data);
            if (data.gamePlayState === "END_SOLVED") {
              const guesses = data.gameState?.blueprintGameState?.length;
              if (guesses >= 1 && guesses <= 5) return guesses;
            }
          }
        }
      } catch (_e) {
        // localStorage access may fail in some contexts
      }

      return null;
    },

    extractDate(_doc: Document): string | null {
      return extractDateFromDOM(_doc);
    },

    extractStatus(doc: Document): boolean | null {
      // Pinpoint completion: "See results" link present OR the answer is revealed
      const resultsLink = doc.querySelector('a[href*="/results"]');
      if (resultsLink) return true;

      // The answer area has a non-empty state when game is complete
      const answerEl = doc.querySelector(".pinpoint__card__answer");
      if (answerEl && !answerEl.classList.contains("pinpoint__card__answer--empty")) {
        return true;
      }

      return null;
    },
  },

  queens: createTimeBasedExtractor(),
  crossclimb: createTimeBasedExtractor(),
  tango: createTimeBasedExtractor(),
  wend: createTimeBasedExtractor(),
  patches: createTimeBasedExtractor(),
  zip: createTimeBasedExtractor(),
  sudoku: createTimeBasedExtractor(),
};

// --- Toast Notification ---

/** Shows an auto-dismissing toast notification on extraction failure */
function showErrorToast(message: string, durationMs = 5000): void {
  const toast = document.createElement("div");
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "polite");
  toast.style.cssText = [
    "position: fixed",
    "bottom: 24px",
    "right: 24px",
    "z-index: 999999",
    "padding: 12px 20px",
    "background-color: #cc1016",
    "color: #ffffff",
    "border-radius: 8px",
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "font-size: 14px",
    "line-height: 1.4",
    "box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15)",
    "max-width: 360px",
    "opacity: 0",
    "transform: translateY(12px)",
    "transition: opacity 0.3s ease, transform 0.3s ease",
  ].join("; ");

  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // Auto-dismiss after duration
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px)";
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, durationMs);
}

// --- GameScraper Class ---

type TimeBasedGameType = Exclude<GameType, "pinpoint">;

/**
 * Main scraper class that observes game pages for completion state,
 * extracts results, and reports them to the service worker.
 */
class GameScraper {
  private gameType: GameType;
  private observer: MutationObserver | null = null;
  private hasReported = false;

  constructor(gameType: GameType) {
    this.gameType = gameType;
  }

  /**
   * Starts observing the DOM for the completion state.
   * Uses a MutationObserver on the game container element.
   *
   * When skipInitialCheck is true (after SPA navigation), we skip the
   * immediate DOM check and rely solely on the MutationObserver. This
   * prevents capturing stale DOM from the previous game's view that
   * hasn't been unmounted yet during SPA transitions.
   */
  observe(skipInitialCheck = false): void {
    // Check if the game is already complete (page may have loaded with results).
    // Skipped after SPA navigation to avoid reading stale DOM from the previous game.
    if (!skipInitialCheck) {
      this.checkAndExtract();
    }

    // Set up MutationObserver to detect when completion state renders
    this.observer = new MutationObserver((_mutations: MutationRecord[]) => {
      if (!this.hasReported) {
        this.checkAndExtract();
      }
    });

    // Observe the entire document body for subtree changes
    // LinkedIn games are SPAs that dynamically render completion state
    const target = document.body;
    if (target) {
      this.observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-label", "disabled", "href"],
      });
    }
  }

  /**
   * Extracts game result data from the current page.
   * Returns partial data — some fields may be null.
   */
  extractResult(): {
    metric: number | null;
    date: string | null;
    completed: boolean | null;
  } {
    const extractor = extractors[this.gameType];
    return {
      metric: extractor.extractMetric(document),
      date: extractor.extractDate(document),
      completed: extractor.extractStatus(document),
    };
  }

  /**
   * Sends extracted result to service worker via chrome.runtime.sendMessage.
   * Retries once after 500ms if sendMessage fails.
   */
  async reportResult(result: GameSession): Promise<void> {
    const message = {
      type: MessageType.GAME_RESULT,
      payload: result,
    };

    try {
      console.log("Sending game", result);
      await browserAPI.runtime.sendMessage(message);
    } catch (_error) {
      // Retry once after 500ms delay
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        await browserAPI.runtime.sendMessage(message);
      } catch (_retryError) {
        console.error(
          "LinkedIn Games Tracker: Failed to send game result to service worker after retry",
        );
      }
    }
  }

  /** Track how many times we've attempted extraction after seeing completion */
  private extractionAttempts = 0;
  /** Maximum attempts before giving up */
  private static readonly MAX_EXTRACTION_ATTEMPTS = 30;
  /** Delay in ms between retry attempts */
  private static readonly RETRY_DELAY_MS = 500;
  /** Whether we've started the extraction retry loop */
  private extractionStarted = false;

  /**
   * Verifies the current URL still matches this scraper's game type.
   * Prevents reporting stale results if the user has navigated away
   * before the extraction retry loop completed.
   */
  private isUrlStillValid(): boolean {
    const currentGameType = detectGameType(globalThis.location.href);
    return currentGameType === this.gameType;
  }

  /**
   * Checks DOM for completion state and extracts/reports if found.
   * Only triggers the extraction loop once completion is detected.
   * The actual extraction waits until the metric (time/score) is readable,
   * retrying periodically since LinkedIn often renders the "See results"
   * link before the timer/score has fully populated.
   */
  private checkAndExtract(): void {
    if (this.hasReported || this.extractionStarted) return;

    // Guard: ensure the URL still matches this game type.
    // During SPA transitions, stale DOM elements from the previous game
    // can briefly appear before the new game's view mounts.
    if (!this.isUrlStillValid()) return;

    // Check if the game appears to be in a completed state
    const status = extractors[this.gameType].extractStatus(document);
    if (status === null) {
      // No completion indicator found yet — keep waiting
      return;
    }

    // Completion detected — start the extraction retry loop
    this.extractionStarted = true;
    this.attemptExtraction();
  }

  /**
   * Attempts to extract the metric. If not available yet, retries
   * up to MAX_EXTRACTION_ATTEMPTS times with RETRY_DELAY_MS spacing.
   */
  private attemptExtraction(): void {
    if (this.hasReported) return;

    // Abort if the user navigated away from this game
    if (!this.isUrlStillValid()) {
      this.hasReported = true;
      this.disconnect();
      return;
    }

    this.extractionAttempts++;
    const { metric, date, completed } = this.extractResult();

    // If we got a valid metric, report immediately
    if (metric !== null && metric > 0) {
      const session = this.buildSession(metric, date, completed);
      if (session) {
        this.hasReported = true;
        this.disconnect();
        this.reportResult(session);
      }
      return;
    }

    // Metric not available yet — retry if we have attempts left
    if (this.extractionAttempts < GameScraper.MAX_EXTRACTION_ATTEMPTS) {
      setTimeout(() => {
        this.attemptExtraction();
      }, GameScraper.RETRY_DELAY_MS);
      return;
    }

    // Exhausted all retries. If we at least have date/completed, report with defaults.
    if (date !== null || completed !== null) {
      const session = this.buildSession(metric, date, completed);
      if (session) {
        this.hasReported = true;
        this.disconnect();
        this.reportResult(session);
      }
      return;
    }

    // Complete failure — show error toast
    showErrorToast(
      "LinkedIn Games Tracker: Could not capture game result. The page structure may have changed.",
    );
    this.hasReported = true;
    this.disconnect();
  }

  /**
   * Builds a complete GameSession from extracted data.
   * Uses defaults for missing non-critical fields.
   */
  private buildSession(
    metric: number | null,
    date: string | null,
    completed: boolean | null,
  ): GameSession | null {
    const sessionDate = date ?? getTodayISO();
    const sessionCompleted = completed ?? true;
    const scrapedAt = new Date().toISOString();

    if (this.gameType === "pinpoint") {
      // For Pinpoint, score is the metric (1-5 clues/guesses)
      const score = metric !== null && metric >= 1 && metric <= 5 ? metric : 1;
      return {
        gameType: "pinpoint",
        date: sessionDate,
        playerName: "self",
        completed: sessionCompleted,
        scrapedAt,
        score,
      };
    }

    // Time-based games
    const completionTime = metric !== null && metric > 0 ? metric : 1;
    return {
      gameType: this.gameType as TimeBasedGameType,
      date: sessionDate,
      playerName: "self",
      completed: sessionCompleted,
      scrapedAt,
      completionTime,
    };
  }

  /** Disconnects the MutationObserver */
  private disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /** Public cleanup method for when navigation moves away from this game */
  destroy(): void {
    this.disconnect();
    this.hasReported = true; // Prevent any pending retries from firing
  }
}

// --- SPA Navigation Monitor ---

/**
 * Monitors LinkedIn SPA navigation and (re-)initializes the scraper
 * whenever the user lands on a game page. This allows the extension to
 * work continuously as the user browses between games without a full
 * page reload.
 */
class GameNavigationMonitor extends NavigationMonitorBase {
  private currentScraper: GameScraper | null = null;

  protected isScraperActive(): boolean {
    return this.currentScraper !== null;
  }

  protected createScraper(gameType: GameType, wasActive: boolean): void {
    // If we had a previous scraper (SPA navigation between games), skip the
    // immediate initial check to avoid reading stale DOM from the prior game.
    console.log(`LinkedIn Games Tracker: game scraper activated for ${gameType}`);
    this.currentScraper = new GameScraper(gameType);
    this.currentScraper.observe(/* skipInitialCheck */ wasActive);
  }

  protected destroyScraper(): void {
    if (this.currentScraper) {
      this.currentScraper.destroy();
      this.currentScraper = null;
    }
  }
}

// --- Initialization ---

const monitor = new GameNavigationMonitor();
monitor.start();
