/**
 * Shared formatting utilities for displaying game statistics.
 * Provides locale-appropriate formatting for times, averages, dates, and counts.
 */

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
  const date = new Date(isoDate);
  return date.toLocaleDateString();
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
