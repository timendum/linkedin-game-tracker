/**
 * Today View Component
 *
 * Renders the Today Summary dashboard with a date header, completion score,
 * and packed game cards showing results with percentile pills.
 */

import type { GameDaySummary, GameSession, GameType, TodaySummaryData } from "../../lib/types.ts";
import {
  buildPercentilePills,
  formatTime,
  GAME_DISPLAY_NAMES,
  GAME_URLS,
} from "../../lib/formatters.ts";
import { browserAPI } from "../../lib/browser.ts";

/** Sort games by number of user sessions (descending), then alphabetically */
function sortedGames(games: GameDaySummary[]): GameDaySummary[] {
  return [...games].sort((a, b) => {
    const countDiff = b.priorSessionCount - a.priorSessionCount;
    if (countDiff !== 0) return countDiff;
    return a.gameType.localeCompare(b.gameType);
  });
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
        <h2 class="today-header__date">{dateStr}</h2>
        <span class="today-header__score">{completedCount}/{totalCount}</span>
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

  if (!isCompleted) {
    return (
      <div class="today-card today-card--unplayed">
        <div class="today-card__top">
          <a
            class="today-card__name today-card__name--link"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onGameSelect?.(summary.gameType);
            }}
          >
            {GAME_DISPLAY_NAMES[summary.gameType]}
          </a>
        </div>
        <button
          type="button"
          class="today-card__cta"
          onClick={() => browserAPI.tabs.create({ url: GAME_URLS[summary.gameType] })}
        >
          Play
        </button>
      </div>
    );
  }

  const session = summary.userSession!;
  const histPercentile = summary.historicalPercentile;
  const friendsPercentile = summary.friendsPercentile;

  return (
    <div class="today-card today-card--played">
      <div class="today-card__top">
        <a
          class="today-card__name today-card__name--link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onGameSelect?.(summary.gameType);
          }}
        >
          {GAME_DISPLAY_NAMES[summary.gameType]}
        </a>
        <span class="today-card__result">{formatResult(session)}</span>
        <a
          class="today-card__link"
          href={GAME_URLS[summary.gameType]}
          onClick={(e) => {
            e.preventDefault();
            browserAPI.tabs.create({ url: GAME_URLS[summary.gameType] + "/results/" });
          }}
        >
          Results ↗
        </a>
      </div>

      <div class="today-card__pills">
        {buildPercentilePills(histPercentile, friendsPercentile).map((pill) => (
          <span class={`today-card__pill ${pill.cssClass}`}>{pill.label}</span>
        ))}
      </div>
    </div>
  );
}
