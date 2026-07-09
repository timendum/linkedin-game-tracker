/**
 * Message Controller Module
 *
 * Registers a browser message listener and routes incoming messages to the
 * appropriate Data Store and Storage Monitor methods.
 */

import type { GameSession, GameType, LeaderboardResultsPayload } from "../lib/types.ts";
import { MessageType } from "../lib/types.ts";
import { browserAPI } from "../lib/browser.ts";
import { DataStore } from "./data-store.ts";

/**
 * Registers the message handler on the browser runtime.
 * Instantiates DataStore and routes each incoming message by its `type` field.
 */
export function registerHandlers(): void {
  const dataStore = new DataStore();

  browserAPI.runtime.onMessage.addListener(
    (msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
      const message = msg as { type: string; [key: string]: unknown };

      handleMessage(message, dataStore)
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
): Promise<unknown> {
  switch (message.type) {
    case MessageType.GAME_RESULT: {
      const session = message.payload as GameSession;
      const results = await dataStore.saveSession([session]);
      return results[0];
    }

    case MessageType.LEADERBOARD_RESULTS: {
      const payload = message.payload as LeaderboardResultsPayload;
      const sessions: GameSession[] = [...payload.friendSessions];
      if (payload.userSession) {
        sessions.push(payload.userSession);
      }
      return await dataStore.saveSession(sessions);
    }

    case MessageType.GET_TODAY_SUMMARY: {
      const date = message.date as string;
      return await dataStore.getTodaySummary(date);
    }

    case MessageType.GET_GAME_DETAIL: {
      const gameType = message.gameType as GameType;
      const date = message.date as string;
      return await dataStore.getGameDetail(gameType, date);
    }

    case MessageType.GET_RANK_HISTORY: {
      const gameType = message.gameType as GameType;
      const days = (message.days as number) || 14;
      return await dataStore.getRankHistory(gameType, days);
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}
