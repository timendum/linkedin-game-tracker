/// <reference lib="dom" />
/**
 * Sessions View Module
 *
 * Renders the 20 most recent game sessions for a selected game type
 * into the #sessions-content container.
 */

import type { GameSession } from "../../lib/types.ts";
import { formatAverage, formatDate, formatTime } from "../../lib/formatters.ts";

/** Capitalize the first letter of a game type for display */
function capitalize(gameType: string): string {
  return gameType.charAt(0).toUpperCase() + gameType.slice(1);
}

/**
 * Renders a list of game sessions into the container element.
 * Clears any previous content before rendering.
 */
export function renderSessions(
  container: HTMLElement,
  sessions: GameSession[],
): void {
  container.innerHTML = "";

  if (sessions.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "sessions-empty";
    emptyEl.textContent = "No sessions recorded yet.";
    container.appendChild(emptyEl);
    return;
  }

  for (const session of sessions) {
    const row = document.createElement("div");
    row.className = "session-row";

    const dateSpan = document.createElement("span");
    dateSpan.className = "session-date";
    dateSpan.textContent = formatDate(session.date);

    const gameSpan = document.createElement("span");
    gameSpan.className = "session-game";
    gameSpan.textContent = capitalize(session.gameType);

    const metricSpan = document.createElement("span");
    metricSpan.className = "session-metric";

    if (session.gameType === "pinpoint") {
      metricSpan.textContent = `${formatAverage(session.score)} guesses`;
    } else {
      metricSpan.textContent = formatTime(session.completionTime);
    }

    const statusSpan = document.createElement("span");
    statusSpan.className = "session-status";
    statusSpan.textContent = session.completed ? "✓" : "✗";

    row.appendChild(dateSpan);
    row.appendChild(gameSpan);
    row.appendChild(metricSpan);
    row.appendChild(statusSpan);

    container.appendChild(row);
  }
}
