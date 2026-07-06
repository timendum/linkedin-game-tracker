/// <reference lib="dom" />
/**
 * Comparison View Module
 *
 * Renders a performance ranking table comparing the user and friends
 * for a selected game type over a date range.
 *
 * Rankings are sorted by performance:
 * - Pinpoint: fewer guesses = higher rank
 * - Time-based games: lower time = higher rank
 */

import type { ComparisonData, ComparisonEntry } from "../../lib/types.ts";
import { formatAverage, formatDate, formatTime } from "../../lib/formatters.ts";

/** Capitalize the first letter of a game type for display */
function capitalize(gameType: string): string {
  return gameType.charAt(0).toUpperCase() + gameType.slice(1);
}

/**
 * Sort rankings by performance metric (ascending).
 * - Pinpoint: fewer guesses (averageScore) = higher rank
 * - Time-based: lower time (averageTime) = higher rank
 * Entries with null metrics are placed at the end.
 */
function sortRankings(
  entries: ComparisonEntry[],
  isPinpoint: boolean,
): ComparisonEntry[] {
  return [...entries].sort((a, b) => {
    const metricA = isPinpoint ? a.averageScore : a.averageTime;
    const metricB = isPinpoint ? b.averageScore : b.averageTime;

    if (metricA === null && metricB === null) return 0;
    if (metricA === null) return 1;
    if (metricB === null) return -1;

    return metricA - metricB;
  });
}

/**
 * Renders comparison data into the container element.
 * Clears any previous content before rendering.
 */
export function renderComparison(
  container: HTMLElement,
  data: ComparisonData,
): void {
  container.innerHTML = "";

  const isPinpoint = data.gameType === "pinpoint";

  // Show message when no rankings data is available
  if (data.rankings.length === 0) {
    const messageEl = document.createElement("div");
    messageEl.className = "comparison-empty";
    messageEl.textContent =
      "Friends' data is only captured when visible on the LinkedIn results page. Play a game and check the leaderboard to start tracking friends.";
    container.appendChild(messageEl);
    return;
  }

  // Date range header
  const rangeEl = document.createElement("div");
  rangeEl.className = "comparison-range";
  rangeEl.textContent = `${capitalize(data.gameType)} \u2014 ${
    formatDate(data.dateRange.from)
  } to ${formatDate(data.dateRange.to)}`;
  container.appendChild(rangeEl);

  // Sort rankings by performance
  const sorted = sortRankings(data.rankings, isPinpoint);

  // Build ranking table
  const table = document.createElement("table");
  table.className = "comparison-table";
  table.setAttribute("role", "table");
  table.setAttribute("aria-label", "Performance ranking");

  // Table header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const rankTh = document.createElement("th");
  rankTh.textContent = "#";
  rankTh.setAttribute("scope", "col");

  const nameTh = document.createElement("th");
  nameTh.textContent = "Player";
  nameTh.setAttribute("scope", "col");

  const metricTh = document.createElement("th");
  metricTh.textContent = isPinpoint ? "Avg Guesses" : "Avg Time";
  metricTh.setAttribute("scope", "col");

  const gamesTh = document.createElement("th");
  gamesTh.textContent = "Games";
  gamesTh.setAttribute("scope", "col");

  headerRow.appendChild(rankTh);
  headerRow.appendChild(nameTh);
  headerRow.appendChild(metricTh);
  headerRow.appendChild(gamesTh);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement("tbody");

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const row = document.createElement("tr");

    // Highlight the user's own row
    if (entry.playerName === "self") {
      row.className = "comparison-row-self";
    }

    const rankTd = document.createElement("td");
    rankTd.textContent = String(i + 1);

    const nameTd = document.createElement("td");
    nameTd.textContent = entry.playerName === "self" ? "You" : entry.playerName;

    const metricTd = document.createElement("td");
    if (isPinpoint) {
      metricTd.textContent = entry.averageScore !== null
        ? formatAverage(entry.averageScore)
        : "\u2014";
    } else {
      metricTd.textContent = entry.averageTime !== null ? formatTime(entry.averageTime) : "\u2014";
    }

    const gamesTd = document.createElement("td");
    gamesTd.textContent = String(entry.gamesCompleted);

    row.appendChild(rankTd);
    row.appendChild(nameTd);
    row.appendChild(metricTd);
    row.appendChild(gamesTd);
    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  container.appendChild(table);
}
