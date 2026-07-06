/// <reference lib="dom" />
/**
 * Stats View Module
 *
 * Renders game statistics into the #stats-content container.
 * Handles the GameStats discriminated union: renders averageScore for
 * ScoreBasedStats (Pinpoint) and averageTime/bestTime for TimeBasedStats.
 */

import type { GameStats, GameType } from "../../lib/types.ts";
import { formatAverage, formatCount, formatDate, formatTime } from "../../lib/formatters.ts";

/** Capitalize the first letter of a game type for display */
function capitalize(gameType: string): string {
  return gameType.charAt(0).toUpperCase() + gameType.slice(1);
}

/**
 * Renders stats for a given GameStats object into the container element.
 * Clears any previous content before rendering.
 */
export function renderStats(
  container: HTMLElement,
  stats: GameStats,
): void {
  container.innerHTML = "";

  const gameLabel = capitalize(stats.gameType);

  // Total completed
  const totalEl = document.createElement("div");
  totalEl.className = "stat-item";
  totalEl.textContent = `Total completed: ${stats.totalCompleted}`;
  container.appendChild(totalEl);

  // Performance metric — discriminated union handling
  if (stats.gameType === "pinpoint") {
    // ScoreBasedStats: show average guesses
    const avgEl = document.createElement("div");
    avgEl.className = "stat-item";
    avgEl.textContent = `Average guesses: ${formatAverage(stats.averageScore)}`;
    container.appendChild(avgEl);
  } else {
    // TimeBasedStats: show average time and best time
    const avgEl = document.createElement("div");
    avgEl.className = "stat-item";
    avgEl.textContent = `Average time: ${formatTime(stats.averageTime)}`;
    container.appendChild(avgEl);

    const bestEl = document.createElement("div");
    bestEl.className = "stat-item";
    bestEl.textContent = `Best time: ${formatTime(stats.bestTime)}`;
    container.appendChild(bestEl);
  }

  // Completions last month
  const lastMonthEl = document.createElement("div");
  lastMonthEl.className = "stat-item";
  lastMonthEl.textContent = formatCount(stats.completionsLastMonth, gameLabel, "last month");
  container.appendChild(lastMonthEl);

  // Completions this year
  const thisYearEl = document.createElement("div");
  thisYearEl.className = "stat-item";
  thisYearEl.textContent = formatCount(stats.completionsThisYear, gameLabel, "this year");
  container.appendChild(thisYearEl);

  // Last completion date
  const lastDateEl = document.createElement("div");
  lastDateEl.className = "stat-item";
  if (stats.lastCompletionDate) {
    lastDateEl.textContent = `Last completed: ${formatDate(stats.lastCompletionDate)}`;
  } else {
    lastDateEl.textContent = "Last completed: Never";
  }
  container.appendChild(lastDateEl);
}

/**
 * Renders a combined stats summary for all game types (when "All Games" is selected).
 * Shows each game type's stats that have data.
 */
export function renderAllStats(
  container: HTMLElement,
  allStats: GameStats[],
): void {
  container.innerHTML = "";

  if (allStats.length === 0) {
    return;
  }

  for (const stats of allStats) {
    if (stats.totalCompleted === 0) continue;

    const gameSection = document.createElement("div");
    gameSection.className = "stat-game-section";

    const heading = document.createElement("strong");
    heading.textContent = capitalize(stats.gameType);
    gameSection.appendChild(heading);

    const detailsContainer = document.createElement("div");
    detailsContainer.style.marginBottom = "8px";
    renderStats(detailsContainer, stats);
    gameSection.appendChild(detailsContainer);

    container.appendChild(gameSection);
  }
}

/**
 * Checks if there is any data across all stats objects.
 * Returns true if at least one game type has totalCompleted > 0.
 */
export function hasAnyData(allStats: GameStats[]): boolean {
  return allStats.some((s) => s.totalCompleted > 0);
}
