/**
 * Pure computation utilities for the Game Detail View.
 *
 * These functions handle trend normalization, sparkline rendering,
 * statistical calculations, and head-to-head record computation.
 */

import type { GameSession, GameType, H2HRecord, LeaderboardEntry } from "./types.ts";

/**
 * Normalizes an array of values to a 0-7 integer scale for sparkline rendering.
 * Lower values map to SHORTER bars (faster time = better = shorter bar).
 *
 * Preconditions:
 * - `values` is an array of length 1–14
 * - Non-null entries are positive numbers (seconds > 0 or score > 0)
 *
 * Postconditions:
 * - Output array has same length as input
 * - Null entries remain null
 * - Non-null entries are integers in range [0, 7]
 * - Lower input values produce lower output values (better = shorter bar)
 */
export function normalizeTrend(values: (number | null)[]): (number | null)[] {
  const defined = values.filter((v): v is number => v !== null);
  if (defined.length === 0) return values.map(() => null);

  const min = Math.min(...defined);
  const max = Math.max(...defined);
  const range = max - min;

  return values.map((v) => {
    if (v === null) return null;
    if (range === 0) return 4; // all same value → middle height
    const normalized = (v - min) / range;
    return Math.round(normalized * 7);
  });
}

/**
 * Computes the median of a sorted array of numbers.
 *
 * Preconditions:
 * - `values` contains positive numbers
 *
 * Postconditions:
 * - Returns null for empty array
 * - Returns the middle value (odd length) or average of two middle values (even length)
 * - Result is rounded to nearest integer for even-length arrays
 */
export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

/**
 * Computes a percentile using "better or equal" semantics (lower metric = better).
 * Counts how many comparison values the target value is better than or equal to.
 *
 * Supports two kinds:
 * - "historical": compares today's result against own prior sessions.
 *   Returns 100 if no comparison data (fallback = always best).
 * - "friends": compares today's result against friends' sessions today.
 *   Returns null if no comparison data (no friends to compare against).
 *
 * Preconditions:
 * - `targetValue` is a positive number (seconds or score)
 * - `comparisonValues` contains positive numbers of the same unit
 *
 * Postconditions:
 * - Returns integer in [0, 100] or null (only for "friends" with empty comparison)
 * - Higher return value = better performance relative to comparison group
 */
export function computePercentile(
  targetValue: number,
  comparisonValues: number[],
  kind: "historical" | "friends",
): number | null {
  if (comparisonValues.length === 0) {
    return kind === "historical" ? 100 : null;
  }

  const betterOrEqual = comparisonValues.filter((v) => targetValue <= v).length;
  return Math.round((betterOrEqual / comparisonValues.length) * 100);
}

/**
 * Returns the performance metric for a game session.
 * For pinpoint: returns session.score
 * For time-based: returns session.completionTime
 */
export function getMetric(session: GameSession): number {
  if (session.gameType === "pinpoint") {
    return session.score;
  }
  return session.completionTime;
}

/**
 * Computes head-to-head record between the user and a friend.
 * Only counts days where both players completed the same game.
 *
 * Preconditions:
 * - Both arrays contain only completed sessions for the same gameType
 * - Sessions are uniquely keyed by date (one per day per player)
 *
 * Postconditions:
 * - Returns null if no overlapping dates exist
 * - wins + losses + ties === number of common dates
 * - All values are raw counts
 */
export function computeH2H(
  userSessions: GameSession[],
  friendSessions: GameSession[],
): H2HRecord | null {
  const userByDate = new Map(userSessions.map((s) => [s.date, s]));
  const friendByDate = new Map(friendSessions.map((s) => [s.date, s]));

  const commonDates = [...userByDate.keys()].filter((d) => friendByDate.has(d));

  if (commonDates.length === 0) return null;

  let userWins = 0;
  let ties = 0;
  for (const date of commonDates) {
    const userMetric = getMetric(userByDate.get(date)!);
    const friendMetric = getMetric(friendByDate.get(date)!);
    if (userMetric < friendMetric) userWins++;
    else if (userMetric === friendMetric) ties++;
  }

  const losses = commonDates.length - userWins - ties;
  return { wins: userWins, losses, ties };
}

/**
 * Formats today's game result as a human-readable string.
 *
 * Preconditions:
 * - session is a completed game session
 *
 * Postconditions:
 * - For pinpoint: returns "{score} guess" (singular when 1) or "{score} guesses" (plural)
 * - For time-based: returns "{seconds} sec" if < 60, else "{m}m {s}s"
 */
export function formatTodayResult(session: GameSession): string {
  if (session.gameType === "pinpoint") {
    const score = session.score;
    return score === 1 ? "1 guess" : `${score} guesses`;
  }

  const totalSeconds = session.completionTime;
  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Builds the friends leaderboard for the game detail view.
 *
 * Preconditions:
 * - userSessions contains sessions only for gameType
 * - Each value in friendsSessionsByPlayer contains sessions only for gameType
 * - todayDate is a valid ISO date string
 *
 * Postconditions:
 * - First entry is always the "You" row
 * - Remaining entries sorted by today's value ascending (best first)
 * - Entries without today's value sorted to bottom
 * - Each entry's h2h is computed against user's sessions (null for self)
 */
export function buildLeaderboard(
  userSessions: GameSession[],
  friendsSessionsByPlayer: Map<string, GameSession[]>,
  todayDate: string,
  _gameType: GameType,
): LeaderboardEntry[] {
  // Build the "You" entry
  const userTodaySession = userSessions.find((s) => s.date === todayDate) ?? null;
  const userTodayValue = userTodaySession ? getMetric(userTodaySession) : null;
  const userMetrics = userSessions.map(getMetric);

  const youEntry: LeaderboardEntry = {
    playerName: "You",
    todayValue: userTodayValue,
    median: computeMedian(userMetrics),
    h2h: null,
  };

  // Build friend entries
  const friendEntries: LeaderboardEntry[] = [];
  for (const [playerName, friendSessions] of friendsSessionsByPlayer) {
    const friendTodaySession = friendSessions.find((s) => s.date === todayDate) ?? null;
    const friendTodayValue = friendTodaySession ? getMetric(friendTodaySession) : null;
    const friendMetrics = friendSessions.map(getMetric);

    friendEntries.push({
      playerName,
      todayValue: friendTodayValue,
      median: computeMedian(friendMetrics),
      h2h: computeH2H(userSessions, friendSessions),
    });
  }

  // Sort friends: entries with todayValue first (ascending), then entries without todayValue
  friendEntries.sort((a, b) => {
    if (a.todayValue !== null && b.todayValue !== null) {
      return a.todayValue - b.todayValue;
    }
    if (a.todayValue !== null && b.todayValue === null) return -1;
    if (a.todayValue === null && b.todayValue !== null) return 1;
    return 0;
  });

  return [youEntry, ...friendEntries];
}
