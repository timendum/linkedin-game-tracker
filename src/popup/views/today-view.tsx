/**
 * Today View Component
 *
 * Renders the Today Summary dashboard with a date header, completion score,
 * and packed game cards showing results with percentile pills.
 */

import type { GameDaySummary, GameSession, GameType, TodaySummaryData } from "../../lib/types.ts";
import { useCallback } from "preact/hooks";
import {
  buildPercentilePills,
  formatTime,
  GAME_DISPLAY_NAMES,
  GAME_URLS,
  sortGameTypes,
} from "../../lib/formatters.ts";
import { browserAPI } from "../../lib/browser.ts";

/** Sort games by number of user sessions (descending), then alphabetically */
function sortedGames(games: GameDaySummary[]): GameDaySummary[] {
  const order = sortGameTypes(games);
  const byType = new Map(games.map((g) => [g.gameType, g]));
  return order.map((gt) => byType.get(gt)!);
}

interface TodaySummaryProps {
  data: TodaySummaryData;
  onGameSelect?: (gameType: GameType) => void;
}

export function TodaySummary({ data, onGameSelect }: TodaySummaryProps) {
  const dateObj = Temporal.PlainDate.from(data.date);
  const dateStr = dateObj.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const completedCount = data.games.filter(
    (g) => g.userSession !== null && g.userSession.completed,
  ).length;
  const totalCount = data.games.length;

  return (
    <section id="today-summary" class="section" aria-label="Today summary">
      <div class="today-header">
        <h2 class="today-header-date">{dateStr}</h2>
        <span class="today-header-score">{completedCount}/{totalCount}</span>
      </div>

      <div class="today-cards">
        {sortedGames(data.games).map((summary) => (
          <GameCard key={summary.gameType} summary={summary} onGameSelect={onGameSelect} />
        ))}
      </div>
    </section>
  );
}

// --- Internal helpers ---

function formatResult(session: GameSession): string {
  if (session.gameType === "pinpoint") {
    const plural = session.score === 1 ? "guess" : "guesses";
    return `${session.score} ${plural}`;
  }
  return formatTime(session.completionTime);
}

// --- Game Card Component ---

interface GameCardProps {
  summary: GameDaySummary;
  onGameSelect?: (gameType: GameType) => void;
}

function GameCard({ summary, onGameSelect }: GameCardProps) {
  const isCompleted = summary.userSession !== null && summary.userSession.completed;
  const selectGame = useCallback(() => {
    onGameSelect?.(summary.gameType);
  }, [onGameSelect, summary]);
  const openGame = useCallback((e: preact.TargetedMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    browserAPI.tabs.create({ url: GAME_URLS[summary.gameType] });
  }, [summary]);
  const openGameResults = useCallback((e: preact.TargetedMouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    browserAPI.tabs.create({ url: GAME_URLS[summary.gameType] + "/results/" });
  }, [summary]);

  if (!isCompleted) {
    return (
      <div class="today-card today-card--unplayed today-card--clickable" onClick={selectGame}>
        <div class="today-card-body">
          <div class="today-card-top">
            <span class="today-card-name">
              {GAME_DISPLAY_NAMES[summary.gameType]}
            </span>
          </div>
          <button
            type="button"
            class="today-card-cta"
            onClick={openGame}
          >
            Play
          </button>
        </div>
        <span class="today-card-chevron" aria-hidden="true">›</span>
      </div>
    );
  }

  const session = summary.userSession!;
  const histPercentile = summary.historicalPercentile;
  const friendsPercentile = summary.friendsPercentile;

  return (
    <div class="today-card today-card--played today-card--clickable" onClick={selectGame}>
      <div class="today-card-body">
        <div class="today-card-top">
          <span class="today-card-name">
            {GAME_DISPLAY_NAMES[summary.gameType]}
          </span>
          <span class="today-card-result">{formatResult(session)}</span>
          <a
            class="today-card-link"
            href={GAME_URLS[summary.gameType]}
            onClick={openGameResults}
          >
            Results ↗
          </a>
        </div>

        <div class="game-pills">
          {buildPercentilePills(histPercentile, friendsPercentile).map((pill) => (
            <span key={pill.key} class={`game-pill ${pill.cssClass}`}>{pill.label}</span>
          ))}
        </div>
      </div>
      <span class="today-card-chevron" aria-hidden="true">›</span>
    </div>
  );
}
