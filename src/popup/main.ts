/// <reference lib="dom" />
/**
 * Popup UI Main Entry Point
 *
 * Initializes the popup by wiring up the game type selector and
 * rendering stats and sessions views. Handles empty state logic.
 */

import type { ComparisonData, GameStats, GameType, SessionFilter } from "../lib/types.ts";
import { MessageType } from "../lib/types.ts";
import { browserAPI } from "../lib/browser.ts";
import { hasAnyData, renderAllStats, renderStats } from "./views/stats-view.ts";
import { renderSessions } from "./views/sessions-view.ts";
import { renderComparison } from "./views/comparison-view.ts";


/** All supported game types for iterating when checking empty state */
const ALL_GAME_TYPES: GameType[] = [
  "pinpoint",
  "queens",
  "crossclimb",
  "tango",
  "wend",
  "patches",
  "zip",
  "sudoku",
];

/** Get references to DOM elements */
function getElements() {
  return {
    gameSelect: document.getElementById("game-select") as HTMLSelectElement,
    statsSection: document.getElementById("stats-section") as HTMLElement,
    statsContent: document.getElementById("stats-content") as HTMLElement,
    sessionsSection: document.getElementById("sessions-section") as HTMLElement,
    sessionsContent: document.getElementById("sessions-content") as HTMLElement,
    comparisonSection: document.getElementById("comparison-section") as HTMLElement,
    comparisonContent: document.getElementById("comparison-content") as HTMLElement,
    emptyState: document.getElementById("empty-state") as HTMLElement,
  };
}

/** Fetch stats for a specific game type or all game types */
async function fetchStats(gameType?: GameType): Promise<GameStats | GameStats[]> {
  if (gameType) {
    return await browserAPI.runtime.sendMessage({
      type: MessageType.GET_STATS,
      gameType,
    }) as GameStats;
  }

  // Fetch stats for all game types
  const allStats: GameStats[] = [];
  for (const gt of ALL_GAME_TYPES) {
    const stats = await browserAPI.runtime.sendMessage({
      type: MessageType.GET_STATS,
      gameType: gt,
    }) as GameStats;
    allStats.push(stats);
  }
  return allStats;
}

/** Fetch recent sessions for a game type */
async function fetchSessions(gameType?: GameType): Promise<unknown[]> {
  const filter: SessionFilter = {
    playerName: "self",
    limit: 20,
  };
  if (gameType) {
    filter.gameType = gameType;
  }
  return await browserAPI.runtime.sendMessage({
    type: MessageType.GET_SESSIONS,
    filter,
  }) as unknown[];
}

/** Fetch comparison data for a specific game type over the last 7 days */
async function fetchComparison(gameType: GameType): Promise<ComparisonData> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);

  return await browserAPI.runtime.sendMessage({
    type: MessageType.GET_COMPARISON,
    gameType,
    dateRange: {
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0],
    },
  }) as ComparisonData;
}

/** Show the empty state and hide stats/sessions sections */
function showEmptyState(elements: ReturnType<typeof getElements>): void {
  elements.statsSection.classList.add("hidden");
  elements.sessionsSection.classList.add("hidden");
  elements.comparisonSection.classList.add("hidden");
  elements.emptyState.classList.remove("hidden");
}

/** Show stats/sessions sections and hide the empty state */
function showDataState(elements: ReturnType<typeof getElements>): void {
  elements.statsSection.classList.remove("hidden");
  elements.sessionsSection.classList.remove("hidden");
  elements.comparisonSection.classList.remove("hidden");
  elements.emptyState.classList.add("hidden");
}

/** Main update: fetch data and render the appropriate view */
async function updateView(elements: ReturnType<typeof getElements>): Promise<void> {
  const selectedValue = elements.gameSelect.value;
  const gameType = selectedValue ? (selectedValue as GameType) : undefined;

  try {
    const statsResult = await fetchStats(gameType);

    // Check empty state
    if (Array.isArray(statsResult)) {
      // "All Games" selected — check if any game has data
      if (!hasAnyData(statsResult)) {
        showEmptyState(elements);
        return;
      }
      showDataState(elements);
      renderAllStats(elements.statsContent, statsResult);
    } else {
      // Single game type selected
      if (statsResult.totalCompleted === 0) {
        showEmptyState(elements);
        return;
      }
      showDataState(elements);
      renderStats(elements.statsContent, statsResult);
    }

    // Fetch and render sessions only when a specific game type is selected
    if (gameType) {
      const sessions = await fetchSessions(gameType);
      renderSessions(elements.sessionsContent, sessions as import("../lib/types.ts").GameSession[]);
      elements.sessionsSection.classList.remove("hidden");

      // Fetch and render comparison
      const comparisonData = await fetchComparison(gameType);
      renderComparison(elements.comparisonContent, comparisonData);
      elements.comparisonSection.classList.remove("hidden");
    } else {
      // "All Games": hide sessions and comparison sections
      elements.sessionsSection.classList.add("hidden");
      elements.comparisonSection.classList.add("hidden");
    }
  } catch (error) {
    console.error("Failed to load popup data:", error);
  }
}

/** Initialize the popup */
function init(): void {
  const elements = getElements();

  // Listen for game type selector changes
  elements.gameSelect.addEventListener("change", () => {
    updateView(elements);
  });



  // Initial load
  updateView(elements);
}

// Run on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
