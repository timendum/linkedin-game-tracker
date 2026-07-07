/**
 * Data Store Module
 *
 * Manages persistence of game sessions using chrome.storage.local.
 * Sessions are sharded by game type — each game type gets its own storage key
 * (e.g. "sessions_pinpoint", "sessions_queens") for efficient partial reads.
 *
 * Implements composite key deduplication (gameType + date + playerName)
 * and upsert semantics for all write operations.
 */

import type {
  GameDaySummary,
  GameDetailData,
  GameSession,
  GameType,
  SaveResult,
  ScoreBasedSession,
  TimeBasedSession,
  TodaySummaryData,
} from "../lib/types.ts";

import { browserAPI } from "../lib/browser.ts";
import { VALID_GAME_TYPES } from "../lib/validators.ts";
import {
  buildLeaderboard,
  computeMedian,
  computePercentile,
  getMetric,
} from "../lib/game-detail-utils.ts";

/** Returns the storage key for a given game type's session shard */
export function sessionStorageKey(gameType: GameType): string {
  return `sessions_${gameType}`;
}

/** Builds a composite key string from the three key fields */
function compositeKey(
  gameType: GameType,
  date: string,
  playerName: string,
): string {
  return `${gameType}|${date}|${playerName}`;
}

/**
 * Reconstructs the correct discriminated union variant from raw storage data.
 * JSON deserialization loses type information, so we narrow based on gameType.
 */
function narrowSession(raw: Record<string, unknown>): GameSession {
  const gameType = raw.gameType as GameType;
  if (gameType === "pinpoint") {
    return {
      gameType: "pinpoint",
      date: raw.date as string,
      playerName: raw.playerName as string,
      completed: raw.completed as boolean,
      scrapedAt: raw.scrapedAt as string,
      score: raw.score as number,
    } as ScoreBasedSession;
  }
  return {
    gameType,
    date: raw.date as string,
    playerName: raw.playerName as string,
    completed: raw.completed as boolean,
    scrapedAt: raw.scrapedAt as string,
    completionTime: raw.completionTime as number,
  } as TimeBasedSession;
}

export class DataStore {
  /** Retrieve sessions for a single game type from its shard */
  private async loadSessionsForGame(gameType: GameType): Promise<GameSession[]> {
    const key = sessionStorageKey(gameType);
    const data = await browserAPI.storage.get(key);
    const raw = data[key];
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((item: Record<string, unknown>) => narrowSession(item));
  }

  /** Persist sessions array for a single game type shard */
  private async persistSessionsForGame(
    gameType: GameType,
    sessions: GameSession[],
  ): Promise<void> {
    await browserAPI.storage.set({ [sessionStorageKey(gameType)]: sessions });
  }

  /**
   * Save a single session with deduplication.
   * If a session with the same composite key already exists, it is skipped
   * (not overwritten) — this prevents re-scraping from counting a game twice.
   * Import operations use importSessions() which has its own upsert logic.
   */
  async saveSession(session: GameSession): Promise<SaveResult> {
    console.log("saveSession", session);
    try {
      const sessions = await this.loadSessionsForGame(session.gameType);
      const key = compositeKey(
        session.gameType,
        session.date,
        session.playerName,
      );
      const existingIndex = sessions.findIndex(
        (s) => compositeKey(s.gameType, s.date, s.playerName) === key,
      );

      if (existingIndex >= 0) {
        // Already tracked — skip to prevent duplicate counting on revisit
        return { success: true, overwritten: false };
      }

      sessions.push(session);
      await this.persistSessionsForGame(session.gameType, sessions);
      return { success: true, overwritten: false };
    } catch {
      return { success: false, overwritten: false };
    }
  }

  /**
   * Get today's summary data for all 8 game types.
   * For each game: finds user session, friends sessions, computes historical average and percentile.
   */
  async getTodaySummary(date: string): Promise<TodaySummaryData> {
    const games: GameDaySummary[] = [];

    for (const gameType of VALID_GAME_TYPES) {
      const sessions = await this.loadSessionsForGame(gameType);

      // Find user session for the date: prefer completed, otherwise any
      const userSessionsToday = sessions.filter(
        (s) => s.playerName === "self" && s.date === date,
      );
      let userSession: GameSession | null = null;
      if (userSessionsToday.length > 0) {
        const completed = userSessionsToday.find((s) => s.completed);
        userSession = completed ?? userSessionsToday[0];
      }

      // Find friends' completed sessions for the date
      const friendsSessions = sessions.filter(
        (s) => s.playerName !== "self" && s.date === date && s.completed,
      );

      // Compute prior completed user sessions (excluding today)
      const priorSessions = sessions.filter(
        (s) => s.playerName === "self" && s.completed && s.date !== date,
      );
      const priorSessionCount = priorSessions.length;

      // Compute historical average (null if fewer than 2 prior sessions)
      let historicalAverage: number | null = null;
      if (priorSessionCount >= 2) {
        if (gameType === "pinpoint") {
          const total = priorSessions.reduce(
            (sum, s) => sum + (s as ScoreBasedSession).score,
            0,
          );
          historicalAverage = total / priorSessionCount;
        } else {
          const total = priorSessions.reduce(
            (sum, s) => sum + (s as TimeBasedSession).completionTime,
            0,
          );
          historicalAverage = total / priorSessionCount;
        }
      }

      // Compute historical percentile using unified method
      let historicalPercentile = 100;
      if (userSession !== null && userSession.completed) {
        const todayMetric = getMetric(userSession);
        const priorMetrics = priorSessions.map(getMetric);
        historicalPercentile = computePercentile(todayMetric, priorMetrics, "historical")!;
      }

      // Compute friends percentile using unified method
      let friendsPercentile: number | null = null;
      if (userSession !== null && userSession.completed && friendsSessions.length > 0) {
        const todayMetric = getMetric(userSession);
        const friendMetrics = friendsSessions.map(getMetric);
        friendsPercentile = computePercentile(todayMetric, friendMetrics, "friends");
      }

      games.push({
        gameType,
        userSession,
        historicalAverage,
        priorSessionCount,
        historicalPercentile,
        friendsPercentile,
        friendsSessions,
      });
    }

    return { date, games };
  }

  /**
   * Get full game detail data for the per-game detail view.
   * Assembles todaySession, percentiles, personal stats, trend, and leaderboard.
   */
  async getGameDetail(gameType: GameType, date: string): Promise<GameDetailData> {
    const sessions = await this.loadSessionsForGame(gameType);

    // All user completed sessions
    const userCompletedSessions = sessions.filter(
      (s) => s.playerName === "self" && s.completed,
    );

    // 1. Find todaySession: user's completed session for the given date
    const todaySession = userCompletedSessions.find((s) => s.date === date) ?? null;

    // 2. Get today's metric value if exists
    const todayMetric = todaySession ? getMetric(todaySession) : null;

    // 3. Compute historyPercentile
    const priorSessions = userCompletedSessions.filter((s) => s.date !== date);
    const priorMetrics = priorSessions.map(getMetric);
    const historyPercentile = todayMetric !== null
      ? computePercentile(todayMetric, priorMetrics, "historical")!
      : 100;

    // 4. Compute friendsPercentile
    const friendsTodaySessions = sessions.filter(
      (s) => s.playerName !== "self" && s.date === date && s.completed,
    );
    const friendsTodayMetrics = friendsTodaySessions.map(getMetric);
    const friendsPercentile = todayMetric !== null
      ? computePercentile(todayMetric, friendsTodayMetrics, "friends")
      : null;

    // 5. Compute personalBest (minimum metric = best performance)
    const allUserMetrics = userCompletedSessions.map(getMetric);
    const personalBest = allUserMetrics.length > 0 ? Math.min(...allUserMetrics) : null;

    // 6. Compute median
    const median = computeMedian(allUserMetrics);

    // 7. Total games
    const totalGames = userCompletedSessions.length;

    // 8. Compute trendValues (last 14 days ending at date, most recent last)
    const trendDays = 14;
    const trendValues: (number | null)[] = [];
    const endDate = new Date(date + "T00:00:00");
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date(endDate);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0, 10);
      const daySession = userCompletedSessions.find((s) => s.date === dayStr);
      trendValues.push(daySession ? getMetric(daySession) : null);
    }

    // 9. Build leaderboard
    const friendsSessionsByPlayer = new Map<string, GameSession[]>();
    for (const s of sessions) {
      if (s.playerName !== "self" && s.completed) {
        const existing = friendsSessionsByPlayer.get(s.playerName) ?? [];
        existing.push(s);
        friendsSessionsByPlayer.set(s.playerName, existing);
      }
    }

    const leaderboard = buildLeaderboard(
      userCompletedSessions,
      friendsSessionsByPlayer,
      date,
      gameType,
    );

    return {
      gameType,
      date,
      todaySession,
      historyPercentile,
      friendsPercentile,
      personalBest,
      median,
      totalGames,
      trendValues,
      trendDays,
      leaderboard,
    };
  }
}
