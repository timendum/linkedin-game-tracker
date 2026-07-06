/**
 * Shared validation logic for game session data.
 * Validates according to the discriminated union pattern.
 */

import type { GameSession, GameType, ScoreBasedSession, TimeBasedSession } from "./types.ts";

/** Score-based game types (use guesses as metric) */
const SCORE_BASED_TYPES: readonly GameType[] = ["pinpoint"] as const;

/** Time-based game types (use completion time as metric) */
const TIME_BASED_TYPES: readonly GameType[] = [
  "queens",
  "crossclimb",
  "tango",
  "wend",
  "patches",
  "zip",
  "sudoku",
] as const;

/** All valid game types */
export const VALID_GAME_TYPES: readonly GameType[] = [
  ...SCORE_BASED_TYPES,
  ...TIME_BASED_TYPES,
] as const;

/**
 * Checks if a string is a valid GameType.
 */
export function isValidGameType(type: string): type is GameType {
  return VALID_GAME_TYPES.includes(type as GameType);
}

/**
 * Validates an ISO 8601 date string (YYYY-MM-DD) and checks it represents a real calendar date.
 * Uses the Temporal API (Temporal.PlainDate.from) for robust parsing and calendar validation.
 */
export function isValidDate(dateStr: string): boolean {
  if (typeof dateStr !== "string") return false;

  try {
    // Temporal.PlainDate.from with overflow: "reject" throws RangeError for invalid dates
    // (e.g., Feb 30, month 13) and only accepts the ISO 8601 YYYY-MM-DD format.
    Temporal.PlainDate.from(dateStr, { overflow: "reject" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that a score is appropriate for a given game type.
 * For Pinpoint, score must be an integer between 1 and 6 inclusive.
 * For time-based games, score is not applicable.
 */
export function isValidScore(gameType: GameType, score: number): boolean {
  if (SCORE_BASED_TYPES.includes(gameType)) {
    return isValidGuesses(score);
  }
  // Score is not applicable for time-based games
  return false;
}

/**
 * Validates that a value is a valid guess count (integer between 1 and 6 inclusive).
 */
export function isValidGuesses(guesses: number): boolean {
  return (
    typeof guesses === "number" &&
    Number.isInteger(guesses) &&
    guesses >= 1 &&
    guesses <= 6
  );
}

/**
 * Validates that a completion time in seconds is valid (greater than 0).
 */
export function isValidCompletionTime(seconds: number): boolean {
  return typeof seconds === "number" && isFinite(seconds) && seconds > 0;
}

/** Result of validateGameSession */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  narrowed: GameSession | null;
}

/**
 * Validates an unknown value as a GameSession according to the discriminated union rules:
 * - If gameType is 'pinpoint': score must be present (1-6), completionTime must be absent
 * - If gameType is time-based: completionTime must be present (>0), score must be absent
 *
 * Returns a narrowed GameSession (ScoreBasedSession or TimeBasedSession) on success.
 */
export function validateGameSession(session: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof session !== "object" || session === null) {
    return {
      valid: false,
      errors: ["Session must be a non-null object"],
      narrowed: null,
    };
  }

  const obj = session as Record<string, unknown>;

  // Validate gameType
  if (typeof obj.gameType !== "string" || !isValidGameType(obj.gameType)) {
    errors.push(
      `Invalid or missing gameType: must be one of ${VALID_GAME_TYPES.join(", ")}`,
    );
    return { valid: false, errors, narrowed: null };
  }

  const gameType = obj.gameType as GameType;

  // Validate date
  if (typeof obj.date !== "string" || !isValidDate(obj.date)) {
    errors.push(
      "Invalid or missing date: must be a valid ISO 8601 date (YYYY-MM-DD)",
    );
  }

  // Validate playerName
  if (typeof obj.playerName !== "string" || obj.playerName.trim() === "") {
    errors.push("Invalid or missing playerName: must be a non-empty string");
  }

  // Validate completed
  if (typeof obj.completed !== "boolean") {
    errors.push("Invalid or missing completed: must be a boolean");
  }

  // Validate scrapedAt
  if (typeof obj.scrapedAt !== "string" || obj.scrapedAt.trim() === "") {
    errors.push("Invalid or missing scrapedAt: must be a non-empty string");
  }

  // Validate discriminated union fields based on gameType
  if (SCORE_BASED_TYPES.includes(gameType)) {
    // Pinpoint: score must be present and valid, completionTime must be absent
    if (obj.score === undefined || obj.score === null) {
      errors.push("Missing score: Pinpoint games require a score (1-6)");
    } else if (typeof obj.score !== "number" || !isValidGuesses(obj.score)) {
      errors.push("Invalid score: must be an integer between 1 and 6");
    }

    if (obj.completionTime !== undefined && obj.completionTime !== null) {
      errors.push("completionTime must not be present for Pinpoint games");
    }
  } else if (TIME_BASED_TYPES.includes(gameType)) {
    // Time-based: completionTime must be present and valid, score must be absent
    if (obj.completionTime === undefined || obj.completionTime === null) {
      errors.push(
        "Missing completionTime: time-based games require a completionTime (>0)",
      );
    } else if (
      typeof obj.completionTime !== "number" ||
      !isValidCompletionTime(obj.completionTime)
    ) {
      errors.push("Invalid completionTime: must be a number greater than 0");
    }

    if (obj.score !== undefined && obj.score !== null) {
      errors.push("score must not be present for time-based games");
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, narrowed: null };
  }

  // Construct the narrowed type
  if (SCORE_BASED_TYPES.includes(gameType)) {
    const narrowed: ScoreBasedSession = {
      gameType: gameType as "pinpoint",
      date: obj.date as string,
      playerName: obj.playerName as string,
      completed: obj.completed as boolean,
      scrapedAt: obj.scrapedAt as string,
      score: obj.score as number,
    };
    return { valid: true, errors: [], narrowed };
  } else {
    const narrowed: TimeBasedSession = {
      gameType: gameType as TimeBasedSession["gameType"],
      date: obj.date as string,
      playerName: obj.playerName as string,
      completed: obj.completed as boolean,
      scrapedAt: obj.scrapedAt as string,
      completionTime: obj.completionTime as number,
    };
    return { valid: true, errors: [], narrowed };
  }
}
