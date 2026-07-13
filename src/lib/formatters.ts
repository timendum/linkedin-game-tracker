/**
 * Shared formatting utilities for displaying game statistics.
 * Provides locale-appropriate formatting for times, averages, dates, and counts.
 */

import type { GameType } from "./types.ts";
export { GAME_URLS } from "./types.ts";

/**
 * Formats a duration in seconds as a human-readable string.
 * - If seconds < 60: "5s"
 * - If seconds >= 60: "2m 34s"
 * - Zero seconds: "0s"
 */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

/** Human-friendly display names keyed by game type. */
export const GAME_DISPLAY_NAMES: Record<GameType, string> = {
  pinpoint: "Pinpoint",
  queens: "Queens",
  crossclimb: "Crossclimb",
  tango: "Tango",
  wend: "Wend",
  patches: "Patches",
  zip: "Zip",
  sudoku: "Mini-Sudoku",
};

/**
 * Formats a percentile value as "N%".
 */
function formatPercentile(value: number): string {
  return `${value}%`;
}

/**
 * Returns the CSS modifier class for a percentile pill based on tier thresholds.
 * Uses a 5-tier system for consistent color coding across the extension.
 */
function getPercentileTierClass(percentile: number): string {
  if (percentile >= 90) return "pill--excellent";
  if (percentile >= 75) return "pill--great";
  if (percentile >= 50) return "pill--good";
  if (percentile >= 25) return "pill--average";
  return "pill--below";
}

/** Describes a single percentile pill to render. */
export interface PercentilePill {
  label: string;
  cssClass: string;
  key: string;
}

/**
 * Builds the array of percentile pills to display for a game result.
 * Ensures consistent labels, formatting, and color tiers across all views.
 */
export function buildPercentilePills(
  historyPercentile: number | null,
  friendsPercentile: number | null,
): PercentilePill[] {
  const pills: PercentilePill[] = [];

  if (historyPercentile !== null) {
    pills.push({
      label: `🏆 Top ${formatPercentile(historyPercentile)} all time`,
      cssClass: getPercentileTierClass(historyPercentile),
      key: "hist",
    });
  }

  if (friendsPercentile !== null) {
    pills.push({
      label: `👥 Top ${formatPercentile(friendsPercentile)} friends`,
      cssClass: getPercentileTierClass(friendsPercentile),
      key: "friends",
    });
  }

  return pills;
}
