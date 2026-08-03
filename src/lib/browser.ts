/// <reference types="@types/firefox-webext-browser" />

import type {
  ComparisonData,
  GameDetailData,
  GameSession,
  GameType,
  LeaderboardResultsPayload,
  RankHistoryData,
  SaveResult,
  TodaySummaryData,
} from "./types.ts";
import type { MessageType } from "./types.ts";

// --- Typed Messaging Layer ---

/** Maps each MessageType to its request payload shape and response type */
export interface MessageMap {
  [MessageType.GAME_RESULT]: {
    request: { type: MessageType.GAME_RESULT; payload: GameSession };
    response: SaveResult;
  };
  [MessageType.LEADERBOARD_RESULTS]: {
    request: { type: MessageType.LEADERBOARD_RESULTS; payload: LeaderboardResultsPayload };
    response: SaveResult[];
  };
  [MessageType.GET_TODAY_SUMMARY]: {
    request: { type: MessageType.GET_TODAY_SUMMARY; date: string };
    response: TodaySummaryData;
  };
  [MessageType.GET_GAME_DETAIL]: {
    request: { type: MessageType.GET_GAME_DETAIL; gameType: GameType; date: string };
    response: GameDetailData;
  };
  [MessageType.GET_RANK_HISTORY]: {
    request: { type: MessageType.GET_RANK_HISTORY; gameType: GameType; days?: number };
    response: RankHistoryData;
  };
  [MessageType.GET_COMPARISON]: {
    request: { type: MessageType.GET_COMPARISON; gameType: GameType; friendName: string };
    response: ComparisonData;
  };
  [MessageType.GET_ALL_FRIENDS]: {
    request: { type: MessageType.GET_ALL_FRIENDS };
    response: string[];
  };
  [MessageType.GET_LATEST_SCRAPE_TIME]: {
    request: { type: MessageType.GET_LATEST_SCRAPE_TIME; gameType: GameType; excludeDate?: string };
    response: string | null;
  };
  [MessageType.GET_ALL_SESSIONS]: {
    request: { type: MessageType.GET_ALL_SESSIONS };
    response: GameSession[];
  };
  [MessageType.IMPORT_SESSIONS]: {
    request: { type: MessageType.IMPORT_SESSIONS; payload: GameSession[] };
    response: SaveResult[];
  };
}

/** Union of all valid request messages */
export type AppMessage = MessageMap[MessageType]["request"];

/** Extract the response type for a given message type */
export type MessageResponse<T extends MessageType> = MessageMap[T]["response"];

// --- Browser API ---

export interface BrowserAPI {
  runtime: Omit<typeof globalThis.browser.runtime, "sendMessage"> & {
    sendMessage<T extends AppMessage>(message: T): Promise<MessageResponse<T["type"]>>;
  };
  tabs: typeof globalThis.browser.tabs;
}

/** Browser API for use throughout the codebase */
export const browserAPI: BrowserAPI = {
  runtime: globalThis.browser.runtime as BrowserAPI["runtime"],
  tabs: globalThis.browser.tabs,
};
