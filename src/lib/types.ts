/**
 * Core type definitions for the LinkedIn Games Tracker extension.
 *
 * Composite Key Strategy:
 * Game sessions are uniquely identified by the combination of (gameType, date, playerName).
 * This composite key is used for:
 * - Deduplication: Scraper checks before storing; existing entries are overwritten
 * - Import merge: Matching records are overwritten, non-matching are inserted
 * - Lookup: Efficient filtering by any key component
 */

/** Supported LinkedIn game types */
export type GameType =
  | "pinpoint"
  | "queens"
  | "crossclimb"
  | "tango"
  | "wend"
  | "patches"
  | "zip"
  | "sudoku";

/**
 * Canonical mapping from URL path segments to GameType.
 * This is the single source of truth for game ↔ URL relationships.
 * Used by content scripts for detection and by the popup for linking.
 */
export const GAME_URL_PATHS: Record<string, GameType> = {
  "/games/pinpoint": "pinpoint",
  "/games/queens": "queens",
  "/games/crossclimb": "crossclimb",
  "/games/tango": "tango",
  "/games/wend": "wend",
  "/games/patches": "patches",
  "/games/zip": "zip",
  "/games/mini-sudoku": "sudoku",
};

/**
 * Full LinkedIn game URLs keyed by game type.
 * Derived from GAME_URL_PATHS — do not maintain separately.
 */
export const GAME_URLS: Record<GameType, string> = Object.fromEntries(
  Object.entries(GAME_URL_PATHS).map(([path, gameType]) => [
    gameType,
    `https://www.linkedin.com${path}`,
  ]),
) as Record<GameType, string>;

/**
 * Base fields shared by all game sessions.
 *
 * Composite key: gameType + date + playerName
 * Two sessions with the same composite key are considered the same record.
 * Storing a session with a matching key overwrites the existing entry.
 */
export interface GameSessionBase {
  /** Game type — part of composite key */
  gameType: GameType;
  /** ISO 8601 date: "2024-01-15" — part of composite key */
  date: string;
  /** "self" for the user, display name for friends — part of composite key */
  playerName: string;
  /** Whether the game was successfully completed */
  completed: boolean;
  /** ISO 8601 datetime of when the data was captured */
  scrapedAt: string;
}

/** Pinpoint uses a guess count (1–6) as its performance metric */
export interface ScoreBasedSession extends GameSessionBase {
  gameType: "pinpoint";
  /** Number of guesses used (1–6) */
  score: number;
  completionTime?: never;
}

/** All other games use completion time in seconds as their performance metric */
export interface TimeBasedSession extends GameSessionBase {
  gameType:
    | "queens"
    | "crossclimb"
    | "tango"
    | "wend"
    | "patches"
    | "zip"
    | "sudoku";
  score?: never;
  /** Completion time in seconds */
  completionTime: number;
}

/** A single completed play of a LinkedIn game (discriminated union on gameType) */
export type GameSession = ScoreBasedSession | TimeBasedSession;

/** Result of a single session save operation */
export interface SaveResult {
  success: boolean;
  /** True if an existing session with the same composite key was replaced */
  overwritten: boolean;
}

/** Message types for inter-component communication via chrome.runtime.sendMessage */
export enum MessageType {
  GAME_RESULT = "game_result",
  LEADERBOARD_RESULTS = "leaderboard_results",
  GET_TODAY_SUMMARY = "get_today_summary",
  GET_GAME_DETAIL = "get_game_detail",
  GET_RANK_HISTORY = "get_rank_history",
  GET_COMPARISON = "get_comparison",
  GET_ALL_FRIENDS = "get_all_friends",
  GET_LATEST_SCRAPE_TIME = "get_latest_scrape_time",
  GET_ALL_SESSIONS = "get_all_sessions",
  IMPORT_SESSIONS = "import_sessions",
}

/** Payload for LEADERBOARD_RESULTS: bundles user + friends in one message to avoid race conditions */
export interface LeaderboardResultsPayload {
  /** The current user's result from the "You" row, or null if not found */
  userSession: GameSession | null;
  /** Friends' sessions extracted from the leaderboard */
  friendSessions: GameSession[];
}

/** Summary data for a single game on a given date */
export interface GameDaySummary {
  gameType: GameType;
  /** User's completed session for the date, or null if not played */
  userSession: GameSession | null;
  /** Historical average metric (score for pinpoint, seconds for time-based) */
  historicalAverage: number | null;
  /** Count of prior completed sessions (excluding today) */
  priorSessionCount: number;
  /** Percentile rank (0–100) vs own history, null if not played today */
  historicalPercentile: number | null;
  /** Percentile rank (0–100) vs friends today, null if no friends data */
  friendsPercentile: number | null;
  /** Friends' completed sessions for the same date */
  friendsSessions: GameSession[];
}

/** Response payload for GET_TODAY_SUMMARY */
export interface TodaySummaryData {
  date: string;
  games: GameDaySummary[];
}

/**
 * Head-to-head record between the user and a friend.
 * Only counts days where both players completed the same game.
 */
export interface H2HRecord {
  /** Number of days where user performed better (lower metric is better) */
  wins: number;
  /** Number of days where friend performed better */
  losses: number;
  /** Number of days where both had the same metric */
  ties: number;
}

/**
 * A single entry in the friends leaderboard table.
 * The "You" row always appears first; friends are sorted by today's performance.
 */
export interface LeaderboardEntry {
  /** Display name — "You" for the current user */
  playerName: string;
  /** Today's metric value (seconds or score), null if not yet played */
  todayValue: number | null;
  /** Median performance value across all completed sessions */
  median: number | null;
  /** Head-to-head record vs the user, null for the user's own row */
  h2h: H2HRecord | null;
}

/**
 * Complete data payload for the per-game detail view.
 * Returned by the background service worker in response to GET_GAME_DETAIL.
 */
export interface GameDetailData {
  /** Which game this detail view is for */
  gameType: GameType;
  /** ISO 8601 date string for the current day */
  date: string;
  /** User's completed session for today, or null if not yet played */
  todaySession: GameSession | null;
  /** Percentile rank vs own history (0–100, higher = better), null if not played today */
  historyPercentile: number | null;
  /** Percentile rank vs friends today (0–100, higher = better), null if no friends data */
  friendsPercentile: number | null;
  /** Best performance value ever recorded (seconds or score), null if no sessions */
  personalBest: number | null;
  /** Median performance value across all completed sessions, null if no sessions */
  median: number | null;
  /** Daily metric values for the trend sparkline (most recent last), null = no data */
  trendValues: (number | null)[];
  /** Number of days the trend covers (typically 14) */
  trendDays: number;
  /** Friends leaderboard entries (self row first, then sorted by today's performance) */
  leaderboard: LeaderboardEntry[];
}

/**
 * A single player's rank on a given day. Null rank means the player didn't play.
 */
export interface DailyRank {
  date: string;
  rank: number | null;
  /** The raw metric value (score for pinpoint, seconds for time-based), null if not played */
  value: number | null;
}

/**
 * Rank history for a single player across multiple days.
 */
export interface PlayerRankHistory {
  playerName: string;
  ranks: DailyRank[];
}

/**
 * Response payload for GET_RANK_HISTORY.
 * Contains rank data for all players over the requested number of days.
 */
export interface RankHistoryData {
  gameType: GameType;
  days: number;
  players: PlayerRankHistory[];
}

/**
 * A single day's comparison between user and friend.
 * Null metric means the player didn't complete the game that day.
 */
export interface DailyComparison {
  date: string;
  userValue: number | null;
  friendValue: number | null;
  /** "win" if user was better (lower metric), "loss" if friend was better, "tie", or "incomplete" */
  outcome: "win" | "loss" | "tie" | "incomplete";
}

/**
 * Response payload for GET_COMPARISON.
 * Contains detailed head-to-head data between user and a specific friend.
 */
export interface ComparisonData {
  gameType: GameType;
  friendName: string;
  /** Overall head-to-head record */
  h2h: H2HRecord;
  /** User's personal best (min metric), null if no sessions */
  userPersonalBest: number | null;
  /** Friend's personal best (min metric), null if no sessions */
  friendPersonalBest: number | null;
  /** User's median metric, null if no sessions */
  userMedian: number | null;
  /** Friend's median metric, null if no sessions */
  friendMedian: number | null;
  /** User's total completed sessions count */
  userSessionCount: number;
  /** Friend's total completed sessions count */
  friendSessionCount: number;
  /** Last 14 days of daily comparisons (most recent last) */
  dailyResults: DailyComparison[];
}
