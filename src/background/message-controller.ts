/**
 * Message Controller Module
 *
 * Registers a browser message listener and routes incoming messages to the
 * appropriate Data Store and Storage Monitor methods.
 */

import type {
  FriendResult,
  GameSession,
  GameType,
  LeaderboardResultsPayload,
  ScoreBasedSession,
  SessionFilter,
  TimeBasedSession,
} from "../lib/types.ts";
import { MessageType } from "../lib/types.ts";
import { browserAPI } from "../lib/browser.ts";
import { DataStore } from "./data-store.ts";
import { StorageMonitor } from "./storage-monitor.ts";

/** Convert a FriendResult into a GameSession suitable for storage */
function friendResultToSession(result: FriendResult): GameSession {
  const base = {
    gameType: result.gameType,
    date: result.date,
    playerName: result.displayName,
    completed: true,
    scrapedAt: new Date().toISOString(),
  };

  if (result.gameType === "pinpoint") {
    return {
      ...base,
      gameType: "pinpoint",
      score: result.score,
    } as ScoreBasedSession;
  }

  return {
    ...base,
    gameType: result.gameType,
    completionTime: result.completionTime,
  } as TimeBasedSession;
}

/**
 * Registers the message handler on the browser runtime.
 * Instantiates DataStore and StorageMonitor,
 * then routes each incoming message by its `type` field.
 */
export function registerHandlers(): void {
  const dataStore = new DataStore();
  const storageMonitor = new StorageMonitor();

  browserAPI.runtime.onMessage.addListener(
    (msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
      const message = msg as { type: string; [key: string]: unknown };

      handleMessage(message, dataStore, storageMonitor)
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            error: error instanceof Error ? error.message : String(error),
          })
        );

      // Must return true to keep the message channel open for async sendResponse
      return true;
    },
  );
}

/** Routes a message to the appropriate handler based on its type */
async function handleMessage(
  message: { type: string; [key: string]: unknown },
  dataStore: DataStore,
  storageMonitor: StorageMonitor,
): Promise<unknown> {
  switch (message.type) {
    case MessageType.GAME_RESULT: {
      const session = message.payload as GameSession;
      const result = await dataStore.saveSession(session);
      await storageMonitor.onStorageWrite();
      return result;
    }

    case MessageType.FRIENDS_RESULTS: {
      const friendResults = message.payload as FriendResult[];
      const saveResults = [];
      for (const fr of friendResults) {
        const session = friendResultToSession(fr);
        const result = await dataStore.saveSession(session);
        saveResults.push(result);
      }
      await storageMonitor.onStorageWrite();
      return saveResults;
    }

    case MessageType.LEADERBOARD_RESULTS: {
      const payload = message.payload as LeaderboardResultsPayload;
      const saveResults = [];
      // Save user result first, then friends — all sequential, no race
      if (payload.userSession) {
        const result = await dataStore.saveSession(payload.userSession);
        saveResults.push(result);
      }
      for (const fr of payload.friendResults) {
        const session = friendResultToSession(fr);
        const result = await dataStore.saveSession(session);
        saveResults.push(result);
      }
      await storageMonitor.onStorageWrite();
      return saveResults;
    }

    case MessageType.GET_STATS: {
      const gameType = message.gameType as GameType | undefined;
      return await dataStore.getStats(gameType);
    }

    case MessageType.GET_SESSIONS: {
      const filter = message.filter as SessionFilter;
      return await dataStore.getSessions(filter);
    }

    case MessageType.GET_COMPARISON: {
      const gameType = message.gameType as GameType;
      const dateRange = message.dateRange as { from: string; to: string };
      return await dataStore.getFriendsComparison(gameType, dateRange);
    }

    case MessageType.EXPORT_DATA: {
      const filter = message.filter as SessionFilter | undefined;
      return await dataStore.getAllSessions(filter);
    }

    case MessageType.IMPORT_DATA: {
      const sessions = message.sessions as GameSession[];
      const result = await dataStore.importSessions(sessions);
      await storageMonitor.onStorageWrite();
      return result;
    }

    case MessageType.STORAGE_STATUS: {
      return await dataStore.getStorageUsage();
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}
