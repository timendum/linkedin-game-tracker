/**
 * Data Store Module
 *
 * Manages persistence of game sessions using IndexedDB via the `idb` library.
 * Sessions are stored in a single object store with a compound index on
 * (gameType, date, playerName) for efficient querying and deduplication.
 *
 * Implements composite key deduplication (gameType + date + playerName)
 * and upsert semantics for all write operations.
 */

import type {
  ComparisonData,
  DailyComparison,
  GameDaySummary,
  GameDetailData,
  GameSession,
  GameType,
  PlayerRankHistory,
  RankHistoryData,
  SaveResult,
  ScoreBasedSession,
  TimeBasedSession,
  TodaySummaryData,
} from "../lib/types.ts";

import { VALID_GAME_TYPES } from "../lib/validators.ts";
import {
  buildLeaderboard,
  computeMedian,
  computePercentile,
  getMetric,
} from "../lib/game-detail-utils.ts";

import { type DBSchema, type IDBPDatabase, openDB } from "idb";

/** Database name and version */
const DB_NAME = "game-tracker";
const DB_VERSION = 1;

/** IndexedDB schema definition for type safety with idb */
interface GameTrackerDB extends DBSchema {
  sessions: {
    key: string;
    value: GameSession;
    indexes: {
      "by-game-type": GameType;
      "by-composite": [GameType, string, string];
    };
  };
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
 * IndexedDB preserves object structure, but we narrow for type safety.
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
  private dbPromise: Promise<IDBPDatabase<GameTrackerDB>> | null = null;

  /** Opens (or returns cached) database connection */
  private getDB(): Promise<IDBPDatabase<GameTrackerDB>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<GameTrackerDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          const store = db.createObjectStore("sessions", {
            keyPath: undefined,
          });
          store.createIndex("by-game-type", "gameType", { unique: false });
          store.createIndex("by-composite", ["gameType", "date", "playerName"], {
            unique: true,
          });
        },
      });
    }
    return this.dbPromise;
  }

  /** Retrieve sessions for a single game type using the by-game-type index */
  private async loadSessionsForGame(gameType: GameType): Promise<GameSession[]> {
    const db = await this.getDB();
    const raw = await db.getAllFromIndex("sessions", "by-game-type", gameType);
    return raw.map((item) => narrowSession(item as unknown as Record<string, unknown>));
  }

  /**
   * Save a list of sessions for the same game type with deduplication.
   * If a session with the same composite key already exists, it is overwritten
   * only when the metric value differs. Uses a single transaction for the batch.
   */
  async saveSession(incoming: GameSession[]): Promise<SaveResult[]> {
    if (incoming.length === 0) return [];

    const gameType = incoming[0].gameType;
    console.log("saveSession", gameType, incoming.length, "sessions");

    try {
      const db = await this.getDB();
      const tx = db.transaction("sessions", "readwrite");
      const store = tx.store;
      const index = store.index("by-composite");
      const results = await Promise.all(
        incoming.map(async (session): Promise<SaveResult> => {
          const key: [GameType, string, string] = [
            session.gameType,
            session.date,
            session.playerName,
          ];

          const existingKey = await index.getKey(key);
          const existing = existingKey != null ? await store.get(existingKey) : undefined;

          if (existing) {
            const existingNarrowed = narrowSession(
              existing as unknown as Record<string, unknown>,
            );
            if (
              existingNarrowed.completionTime !== session.completionTime ||
              session.score !== existingNarrowed.score
            ) {
              await store.put(session, existingKey!);
              return { success: true, overwritten: true };
            }
            return { success: true, overwritten: false };
          }

          const newKey = compositeKey(session.gameType, session.date, session.playerName);
          await store.put(session, newKey);
          return { success: true, overwritten: false };
        }),
      );

      await tx.done;
      return results;
    } catch {
      return incoming.map(() => ({ success: false, overwritten: false }));
    }
  }

  /**
   * Get today's summary data for all 8 game types.
   * For each game: finds user session, friends sessions, computes historical average and percentile.
   */
  async getTodaySummary(date: string): Promise<TodaySummaryData> {
    const sessionsByGame = await Promise.all(
      VALID_GAME_TYPES.map((gameType) => this.loadSessionsForGame(gameType)),
    );

    const games: GameDaySummary[] = VALID_GAME_TYPES.map((gameType, i) => {
      const sessions = sessionsByGame[i];

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

      return {
        gameType,
        userSession,
        historicalAverage,
        priorSessionCount,
        historicalPercentile,
        friendsPercentile,
        friendsSessions,
      };
    });

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

    // 7. Compute trendValues (last 14 days ending at date, most recent last)
    const trendDays = 14;
    const trendValues: (number | null)[] = [];
    const endDate = Temporal.PlainDate.from(date);
    for (let i = trendDays - 1; i >= 0; i--) {
      const dayStr = endDate.subtract({ days: i }).toString();
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
      trendValues,
      trendDays,
      leaderboard,
    };
  }

  /**
   * Get rank history for all players over the last N days.
   * Rank is computed daily: 1 = best metric, ties share the same rank.
   * Players who didn't play on a given day get null rank.
   */
  async getRankHistory(gameType: GameType, days: number): Promise<RankHistoryData> {
    const sessions = await this.loadSessionsForGame(gameType);
    const today = Temporal.Now.plainDateISO();

    // Build list of date strings
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      dates.push(today.subtract({ days: i }).toString());
    }

    // Collect all unique players
    const playerSet = new Set<string>();
    for (const s of sessions) {
      if (s.completed) {
        playerSet.add(s.playerName === "self" ? "You" : s.playerName);
      }
    }

    // For each date, compute rank and metric value for all players who played that day
    const ranksByDateAndPlayer = new Map<string, Map<string, number | null>>();
    const valuesByDateAndPlayer = new Map<string, Map<string, number | null>>();

    for (const date of dates) {
      const daySessions = sessions.filter((s) => s.date === date && s.completed);

      // Build metrics per player for this day
      const playerMetrics: { name: string; metric: number }[] = [];
      for (const s of daySessions) {
        const name = s.playerName === "self" ? "You" : s.playerName;
        playerMetrics.push({ name, metric: getMetric(s) });
      }

      // Sort by metric ascending (lower is better)
      playerMetrics.sort((a, b) => a.metric - b.metric);

      // Assign ranks with tied values sharing the same rank
      const dayRanks = new Map<string, number | null>();
      const dayValues = new Map<string, number | null>();
      let currentRank = 1;
      for (let i = 0; i < playerMetrics.length; i++) {
        if (i > 0 && playerMetrics[i].metric !== playerMetrics[i - 1].metric) {
          currentRank = i + 1;
        }
        dayRanks.set(playerMetrics[i].name, currentRank);
        dayValues.set(playerMetrics[i].name, playerMetrics[i].metric);
      }

      ranksByDateAndPlayer.set(date, dayRanks);
      valuesByDateAndPlayer.set(date, dayValues);
    }

    // Build the response
    const players: PlayerRankHistory[] = [...playerSet].map((playerName) => ({
      playerName,
      ranks: dates.map((date) => ({
        date,
        rank: ranksByDateAndPlayer.get(date)?.get(playerName) ?? null,
        value: valuesByDateAndPlayer.get(date)?.get(playerName) ?? null,
      })),
    }));

    // Trim leading days where no player has data
    const dayCount = players[0]?.ranks.length ?? 0;
    let firstDataIndex = 0;
    for (let i = 0; i < dayCount; i++) {
      if (players.some((p) => p.ranks[i].rank !== null)) {
        firstDataIndex = i;
        break;
      }
    }
    if (firstDataIndex > 0) {
      for (const p of players) {
        p.ranks = p.ranks.slice(firstDataIndex);
      }
    }

    return { gameType, days, players };
  }

  /**
   * Get detailed comparison data between the user and a specific friend.
   * Computes H2H record, personal bests, medians, and last 14 days of daily results.
   */
  async getComparison(gameType: GameType, friendName: string): Promise<ComparisonData> {
    const sessions = await this.loadSessionsForGame(gameType);

    const userCompleted = sessions.filter(
      (s) => s.playerName === "self" && s.completed,
    );
    const friendCompleted = sessions.filter(
      (s) => s.playerName === friendName && s.completed,
    );

    // H2H record
    const userByDate = new Map(userCompleted.map((s) => [s.date, s]));
    const friendByDate = new Map(friendCompleted.map((s) => [s.date, s]));

    const commonDates = [...userByDate.keys()].filter((d) => friendByDate.has(d));
    let wins = 0;
    let losses = 0;
    let ties = 0;
    for (const date of commonDates) {
      const uMetric = getMetric(userByDate.get(date)!);
      const fMetric = getMetric(friendByDate.get(date)!);
      if (uMetric < fMetric) wins++;
      else if (uMetric > fMetric) losses++;
      else ties++;
    }

    // Personal bests
    const userMetrics = userCompleted.map(getMetric);
    const friendMetrics = friendCompleted.map(getMetric);
    const userPersonalBest = userMetrics.length > 0 ? Math.min(...userMetrics) : null;
    const friendPersonalBest = friendMetrics.length > 0 ? Math.min(...friendMetrics) : null;

    // Medians
    const userMedian = computeMedian(userMetrics);
    const friendMedian = computeMedian(friendMetrics);

    // Daily results (last 14 days)
    const today = Temporal.Now.plainDateISO();
    const dailyResults: DailyComparison[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayStr = today.subtract({ days: i }).toString();
      const userSession = userByDate.get(dayStr);
      const friendSession = friendByDate.get(dayStr);
      const userValue = userSession ? getMetric(userSession) : null;
      const friendValue = friendSession ? getMetric(friendSession) : null;

      let outcome: DailyComparison["outcome"];
      if (userValue === null || friendValue === null) {
        outcome = "incomplete";
      } else if (userValue < friendValue) {
        outcome = "win";
      } else if (userValue > friendValue) {
        outcome = "loss";
      } else {
        outcome = "tie";
      }

      dailyResults.push({ date: dayStr, userValue, friendValue, outcome });
    }

    return {
      gameType,
      friendName,
      h2h: { wins, losses, ties },
      userPersonalBest,
      friendPersonalBest,
      userMedian,
      friendMedian,
      userSessionCount: userCompleted.length,
      friendSessionCount: friendCompleted.length,
      dailyResults,
    };
  }
}
