/**
 * Shared formatting utilities for displaying game statistics.
 * Provides locale-appropriate formatting for times, averages, dates, and counts.
 */

import type { GameType } from "./types.ts";

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

/**
 * Formats a numeric average to one decimal place.
 * Example: 3.2456 → "3.2"
 */
export function formatAverage(value: number): string {
  return value.toFixed(1);
}

/**
 * Formats an ISO date string (YYYY-MM-DD) to a locale-appropriate display string.
 * Uses the default locale for formatting.
 */
export function formatDate(isoDate: string): string {
  const date = Temporal.PlainDate.from(isoDate);
  return date.toLocaleString();
}

/**
 * Formats a count with a game type label and period string.
 * Example: formatCount(26, "Pinpoint", "last month") → "26 Pinpoint games last month"
 */
export function formatCount(
  count: number,
  gameType: string,
  period: string,
): string {
  return `${count} ${gameType} games ${period}`;
}

/** LinkedIn game URLs keyed by game type. */
export const GAME_URLS: Record<GameType, string> = {
  pinpoint: "https://www.linkedin.com/games/pinpoint",
  queens: "https://www.linkedin.com/games/queens",
  crossclimb: "https://www.linkedin.com/games/crossclimb",
  tango: "https://www.linkedin.com/games/tango",
  wend: "https://www.linkedin.com/games/wend",
  patches: "https://www.linkedin.com/games/patches",
  zip: "https://www.linkedin.com/games/zip",
  sudoku: "https://www.linkedin.com/games/mini-sudoku",
};

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
 * Formats the personal average distance with sign and unit.
 * Returns the arithmetic difference between today's result and the historical average,
 * rounded to one decimal place, with a color indicator:
 * - Green "−" prefix when today is better (lower value)
 * - Red "+" prefix when today is worse (higher value)
 * - Neutral "0.0" when today equals the average
 *
 * For time-based games (all except pinpoint), appends "s" suffix.
 */
export function formatDistance(
  todayValue: number,
  average: number,
  gameType: GameType,
): { text: string; color: "green" | "red" | "neutral" } {
  const difference = todayValue - average;
  const rounded = Math.abs(difference);
  const fixed = rounded.toFixed(1);

  if (difference === 0) {
    return { text: "0.0", color: "neutral" };
  }

  const isTimeBased = gameType !== "pinpoint";
  const suffix = isTimeBased ? "s" : "";

  if (difference < 0) {
    // Today is better (lower value)
    return { text: `\u2212${fixed}${suffix}`, color: "green" };
  }

  // Today is worse (higher value)
  return { text: `+${fixed}${suffix}`, color: "red" };
}

/**
 * Formats a percentile value as "N%".
 */
export function formatPercentile(value: number): string {
  return `${value}%`;
}

/**
 * Returns the CSS modifier class for a percentile pill based on tier thresholds.
 * Uses a 5-tier system for consistent color coding across the extension.
 */
export function getPercentileTierClass(percentile: number): string {
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
    });
  }

  if (friendsPercentile !== null) {
    pills.push({
      label: `👥 Top ${formatPercentile(friendsPercentile)} friends`,
      cssClass: getPercentileTierClass(friendsPercentile),
    });
  }

  return pills;
}
