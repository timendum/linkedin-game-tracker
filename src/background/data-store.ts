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
  ComparisonData,
  ComparisonEntry,
  GameDaySummary,
  GameDetailData,
  GameSession,
  GameStats,
  GameType,
  ImportResult,
  SaveResult,
  ScoreBasedSession,
  ScoreBasedStats,
  SessionFilter,
  TimeBasedSession,
  TimeBasedStats,
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

export const STORAGE_KEYS = {
  LAST_EXPORT: "last_export_date",
} as const;

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

  /** Retrieve all sessions across all game type shards */
  private async loadAllSessions(): Promise<GameSession[]> {
    const keys = VALID_GAME_TYPES.map(sessionStorageKey);
    const data = await browserAPI.storage.get(keys);
    const all: GameSession[] = [];
    for (const key of keys) {
      const raw = data[key];
      if (Array.isArray(raw)) {
        for (const item of raw) {
          all.push(narrowSession(item as Record<string, unknown>));
        }
      }
    }
    return all;
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
   * Get sessions matching the filter, sorted by date descending.
   * Default limit is 20.
   * Optimized: if filtering by gameType, only loads that shard.
   */
  async getSessions(filter: SessionFilter): Promise<GameSession[]> {
    const sessions = filter.gameType
      ? await this.loadSessionsForGame(filter.gameType)
      : await this.loadAllSessions();
    const limit = filter.limit ?? 20;
    return this.applyFilter(sessions, filter, limit);
  }

  /** Look up a single session by its composite key */
  async getSessionByKey(
    gameType: GameType,
    date: string,
    playerName: string,
  ): Promise<GameSession | null> {
    const sessions = await this.loadSessionsForGame(gameType);
    const key = compositeKey(gameType, date, playerName);
    const found = sessions.find(
      (s) => compositeKey(s.gameType, s.date, s.playerName) === key,
    );
    return found ?? null;
  }

  /** Compute statistics for a given game type from stored sessions (user only) */
  async getStats(gameType?: GameType): Promise<GameStats> {
    const gt = gameType ?? "pinpoint";
    const sessions = await this.loadSessionsForGame(gt);
    const filtered = sessions.filter((s) => s.completed && s.playerName === "self");

    const totalCompleted = filtered.length;
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);
    const yearStart = `${now.getFullYear()}-01-01`;

    const completionsLastMonth = filtered.filter(
      (s) => s.date >= thirtyDaysAgoStr,
    ).length;
    const completionsThisYear = filtered.filter(
      (s) => s.date >= yearStart,
    ).length;

    const lastCompletionDate = filtered.length > 0
      ? filtered.reduce(
        (max, s) => (s.date > max ? s.date : max),
        filtered[0].date,
      )
      : null;

    if (gt === "pinpoint") {
      const scores = filtered.map((s) => (s as ScoreBasedSession).score);
      const averageScore = scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
          10
        : 0;
      return {
        gameType: "pinpoint",
        totalCompleted,
        completionsLastMonth,
        completionsThisYear,
        lastCompletionDate,
        averageScore,
      } as ScoreBasedStats;
    }

    const times = filtered.map((s) => (s as TimeBasedSession).completionTime);
    const averageTime = times.length > 0
      ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
      : 0;
    const bestTime = times.length > 0 ? Math.min(...times) : 0;

    return {
      gameType: gt,
      totalCompleted,
      completionsLastMonth,
      completionsThisYear,
      lastCompletionDate,
      averageTime,
      bestTime,
    } as TimeBasedStats;
  }

  /** Count completed sessions for a game type within a period */
  async getCompletionCounts(
    gameType: GameType,
    period: "lastMonth" | "thisYear",
  ): Promise<number> {
    const sessions = await this.loadSessionsForGame(gameType);
    const now = new Date();
    let fromDate: string;

    if (period === "lastMonth") {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      fromDate = thirtyDaysAgo.toISOString().slice(0, 10);
    } else {
      fromDate = `${now.getFullYear()}-01-01`;
    }

    return sessions.filter(
      (s) => s.completed && s.date >= fromDate,
    ).length;
  }

  /** Get the most recent completion date for a game type */
  async getLastCompletionDate(gameType: GameType): Promise<string | null> {
    const sessions = await this.loadSessionsForGame(gameType);
    const completed = sessions.filter((s) => s.completed);
    if (completed.length === 0) return null;
    return completed.reduce(
      (max, s) => (s.date > max ? s.date : max),
      completed[0].date,
    );
  }

  /** Get comparison data with participants ranked by performance */
  async getFriendsComparison(
    gameType: GameType,
    dateRange: { from: string; to: string },
  ): Promise<ComparisonData> {
    const sessions = await this.loadSessionsForGame(gameType);
    const filtered = sessions.filter(
      (s) =>
        s.completed &&
        s.date >= dateRange.from &&
        s.date <= dateRange.to,
    );

    // Group by player
    const playerMap = new Map<string, GameSession[]>();
    for (const session of filtered) {
      const existing = playerMap.get(session.playerName) ?? [];
      existing.push(session);
      playerMap.set(session.playerName, existing);
    }

    // Build rankings
    const rankings: ComparisonEntry[] = [];
    for (const [playerName, playerSessions] of playerMap) {
      const gamesCompleted = playerSessions.length;

      if (gameType === "pinpoint") {
        const scores = playerSessions.map((s) => (s as ScoreBasedSession).score);
        const averageScore = scores.length > 0
          ? Math.round(
            (scores.reduce((a, b) => a + b, 0) / scores.length) * 10,
          ) / 10
          : 0;
        rankings.push({
          playerName,
          gamesCompleted,
          averageScore,
          averageTime: null,
          bestTime: null,
        });
      } else {
        const times = playerSessions.map(
          (s) => (s as TimeBasedSession).completionTime,
        );
        const averageTime = times.length > 0
          ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) /
            10
          : 0;
        const bestTime = times.length > 0 ? Math.min(...times) : 0;
        rankings.push({
          playerName,
          gamesCompleted,
          averageScore: null,
          averageTime,
          bestTime,
        });
      }
    }

    // Sort ascending by metric (fewer guesses or lower time is better)
    rankings.sort((a, b) => {
      if (gameType === "pinpoint") {
        return (a.averageScore ?? 0) - (b.averageScore ?? 0);
      }
      return (a.averageTime ?? 0) - (b.averageTime ?? 0);
    });

    return {
      gameType,
      dateRange,
      rankings,
    };
  }

  /** Get storage usage information */
  async getStorageUsage(): Promise<
    { used: number; total: number; percentage: number }
  > {
    const used = await browserAPI.storage.getBytesInUse();
    const total = browserAPI.storage.QUOTA_BYTES;
    const percentage = total > 0 ? Math.round((used / total) * 10000) / 100 : 0;
    return { used, total, percentage };
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

      // Compute historical percentile (null if < 5 prior sessions or no completed user session)
      let historicalPercentile: number | null = null;
      if (priorSessionCount >= 5 && userSession !== null && userSession.completed) {
        let todayMetric: number;
        let countBetterOrEqual: number;

        if (gameType === "pinpoint") {
          todayMetric = (userSession as ScoreBasedSession).score;
          // "Better or equal" means today's value <= prior value (lower is better)
          countBetterOrEqual = priorSessions.filter(
            (s) => todayMetric <= (s as ScoreBasedSession).score,
          ).length;
        } else {
          todayMetric = (userSession as TimeBasedSession).completionTime;
          // "Better or equal" means today's value <= prior value (lower is better)
          countBetterOrEqual = priorSessions.filter(
            (s) => todayMetric <= (s as TimeBasedSession).completionTime,
          ).length;
        }

        historicalPercentile = Math.round(
          (countBetterOrEqual / priorSessionCount) * 100,
        );
      }

      games.push({
        gameType,
        userSession,
        historicalAverage,
        priorSessionCount,
        historicalPercentile,
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
    let historyPercentile: number | null = null;
    if (priorSessions.length >= 1 && todayMetric !== null) {
      const priorMetrics = priorSessions.map(getMetric);
      historyPercentile = computePercentile(todayMetric, priorMetrics);
    }

    // 4. Compute friendsPercentile
    const friendsTodaySessions = sessions.filter(
      (s) => s.playerName !== "self" && s.date === date && s.completed,
    );
    let friendsPercentile: number | null = null;
    if (friendsTodaySessions.length > 0 && todayMetric !== null) {
      const friendsTodayMetrics = friendsTodaySessions.map(getMetric);
      friendsPercentile = computePercentile(todayMetric, friendsTodayMetrics);
    }

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

  /** Get all sessions matching filter without a default limit */
  async getAllSessions(filter?: SessionFilter): Promise<GameSession[]> {
    const sessions = filter?.gameType
      ? await this.loadSessionsForGame(filter.gameType)
      : await this.loadAllSessions();
    if (!filter) {
      return [...sessions].sort((
        a,
        b,
      ) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
    }
    return this.applyFilter(sessions, filter);
  }

  /**
   * Import sessions with upsert semantics.
   * Matching composite keys are overwritten, new ones are inserted.
   * Groups imports by game type and writes each shard independently.
   */
  async importSessions(sessions: GameSession[]): Promise<ImportResult> {
    const result: ImportResult = {
      overwritten: 0,
      inserted: 0,
      skipped: 0,
      error: null,
    };

    try {
      // Group incoming sessions by game type
      const byGameType = new Map<GameType, GameSession[]>();
      for (const session of sessions) {
        try {
          const group = byGameType.get(session.gameType) ?? [];
          group.push(session);
          byGameType.set(session.gameType, group);
        } catch (e) {
          result.skipped++;
          if (result.error === null) {
            result.error = e instanceof Error ? e.message : String(e);
          }
        }
      }

      // Process each game type shard
      for (const [gameType, incoming] of byGameType) {
        const existing = await this.loadSessionsForGame(gameType);
        const keyMap = new Map<string, number>();
        existing.forEach((s, i) => {
          keyMap.set(compositeKey(s.gameType, s.date, s.playerName), i);
        });

        for (const session of incoming) {
          try {
            const key = compositeKey(
              session.gameType,
              session.date,
              session.playerName,
            );
            const existingIndex = keyMap.get(key);

            if (existingIndex !== undefined) {
              existing[existingIndex] = session;
              result.overwritten++;
            } else {
              const newIndex = existing.length;
              existing.push(session);
              keyMap.set(key, newIndex);
              result.inserted++;
            }
          } catch (e) {
            result.skipped++;
            if (result.error === null) {
              result.error = e instanceof Error ? e.message : String(e);
            }
          }
        }

        await this.persistSessionsForGame(gameType, existing);
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
    }

    return result;
  }

  /** Apply filter, sort by date descending, and optionally limit results */
  private applyFilter(
    sessions: GameSession[],
    filter: SessionFilter,
    limit?: number,
  ): GameSession[] {
    let filtered = sessions;

    if (filter.gameType) {
      filtered = filtered.filter((s) => s.gameType === filter.gameType);
    }
    if (filter.dateFrom) {
      filtered = filtered.filter((s) => s.date >= filter.dateFrom!);
    }
    if (filter.dateTo) {
      filtered = filtered.filter((s) => s.date <= filter.dateTo!);
    }
    if (filter.playerName) {
      filtered = filtered.filter((s) => s.playerName === filter.playerName);
    }

    // Sort by date descending
    filtered.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

    if (limit !== undefined) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }
}
