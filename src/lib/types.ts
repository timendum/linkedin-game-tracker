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

/**
 * Base fields shared by all game statistics.
 * Statistics are computed on demand from stored sessions, not persisted.
 */
export interface GameStatsBase {
  gameType: GameType;
  totalCompleted: number;
  completionsLastMonth: number;
  completionsThisYear: number;
  lastCompletionDate: string | null;
}

/** Statistics for Pinpoint (score-based: average guesses) */
export interface ScoreBasedStats extends GameStatsBase {
  gameType: "pinpoint";
  /** Average number of guesses (1–6), rounded to one decimal */
  averageScore: number;
  averageTime?: never;
  bestTime?: never;
}

/** Statistics for time-based games (average and best completion time) */
export interface TimeBasedStats extends GameStatsBase {
  gameType:
    | "queens"
    | "crossclimb"
    | "tango"
    | "wend"
    | "patches"
    | "zip"
    | "sudoku";
  averageScore?: never;
  /** Average completion time in seconds */
  averageTime: number;
  /** Fastest completion time in seconds */
  bestTime: number;
}

/** Statistics derived from stored sessions for a given game type (discriminated union on gameType) */
export type GameStats = ScoreBasedStats | TimeBasedStats;

/** Filter criteria for querying game sessions */
export interface SessionFilter {
  gameType?: GameType;
  /** ISO date — inclusive start of date range */
  dateFrom?: string;
  /** ISO date — inclusive end of date range */
  dateTo?: string;
  /** "self" or friend display name */
  playerName?: string;
  /** Maximum number of results to return */
  limit?: number;
}

/** Result summary returned after an import operation completes */
export interface ImportResult {
  /** Records that matched existing composite keys and were replaced */
  overwritten: number;
  /** Records with new composite keys added to the store */
  inserted: number;
  /** Rows that failed parsing/validation */
  skipped: number;
  /** Non-null if import was interrupted by a failure */
  error: string | null;
}

/** Result of a single session save operation */
export interface SaveResult {
  success: boolean;
  /** True if an existing session with the same composite key was replaced */
  overwritten: boolean;
}

/** Base fields shared by all friend results */
export interface FriendResultBase {
  displayName: string;
  gameType: GameType;
  date: string;
}

/** A friend's Pinpoint result (guess count) */
export interface ScoreBasedFriendResult extends FriendResultBase {
  gameType: "pinpoint";
  /** Number of guesses used (1–6) */
  score: number;
  completionTime?: never;
}

/** A friend's time-based game result */
export interface TimeBasedFriendResult extends FriendResultBase {
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

/** A friend's game result extracted from the leaderboard DOM (discriminated union on gameType) */
export type FriendResult = ScoreBasedFriendResult | TimeBasedFriendResult;

/**
 * Schema for data stored in chrome.storage.local.
 *
 * Session data is sharded by game type under keys like "sessions_pinpoint",
 * "sessions_queens", etc. Each key holds a GameSession[] for that game type.
 */
export interface StorageSchema {
  last_export_date?: string;
}

/**
 * Comparison data for user vs friends performance.
 * Returned by getFriendsComparison for a given game type and date range.
 */
export interface ComparisonData {
  gameType: GameType;
  dateRange: { from: string; to: string };
  /** Participants ranked by performance (ascending metric — fewer guesses or lower time) */
  rankings: ComparisonEntry[];
}

/** A single participant's performance entry in a comparison */
export interface ComparisonEntry {
  playerName: string;
  /** Number of completed games in the date range */
  gamesCompleted: number;
  /** Average guesses for Pinpoint, null for time-based games */
  averageScore: number | null;
  /** Average completion time in seconds for time-based games, null for Pinpoint */
  averageTime: number | null;
  /** Best (lowest) completion time for time-based games, null for Pinpoint */
  bestTime: number | null;
}

/** Message types for inter-component communication via chrome.runtime.sendMessage */
export enum MessageType {
  GAME_RESULT = "game_result",
  FRIENDS_RESULTS = "friends_results",
  LEADERBOARD_RESULTS = "leaderboard_results",
  GET_STATS = "get_stats",
  GET_SESSIONS = "get_sessions",
  GET_COMPARISON = "get_comparison",
  EXPORT_DATA = "export_data",
  IMPORT_DATA = "import_data",
  STORAGE_STATUS = "storage_status",
}

/** Payload for LEADERBOARD_RESULTS: bundles user + friends in one message to avoid race conditions */
export interface LeaderboardResultsPayload {
  /** The current user's result from the "You" row, or null if not found */
  userSession: GameSession | null;
  /** Friends' results extracted from the leaderboard */
  friendResults: FriendResult[];
}
