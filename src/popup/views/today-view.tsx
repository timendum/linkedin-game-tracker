/**
 * Today View Component
 *
 * Renders the Today Summary dashboard with a date header, completion score,
 * and packed game cards showing results with percentile pills.
 */

import type { GameDaySummary, GameSession, GameType, TodaySummaryData } from "../../lib/types.ts";
import {
  formatPercentile,
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

function getMetric(session: GameSession): number {
  if (session.gameType === "pinpoint") return session.score;
  return session.completionTime;
}

function formatResult(session: GameSession): string {
  if (session.gameType === "pinpoint") {
    const plural = session.score === 1 ? "guess" : "guesses";
    return `${session.score} ${plural}`;
  }
  return formatTime(session.completionTime);
}

function computeFriendsPercentile(userMetric: number, friendsSessions: GameSession[]): number {
  if (friendsSessions.length === 0) return 100;
  const friendsBeaten = friendsSessions.filter((f) => userMetric <= getMetric(f)).length;
  return Math.floor((friendsBeaten / friendsSessions.length) * 100);
}

function computeHistoricalPercentile(summary: GameDaySummary): number {
  if (summary.priorSessionCount < 5 || summary.historicalPercentile === null) return 100;
  return summary.historicalPercentile;
}

function getPercentileClass(percentile: number): string {
  if (percentile >= 90) return "pill--excellent";
  if (percentile >= 75) return "pill--great";
  if (percentile >= 50) return "pill--good";
  if (percentile >= 25) return "pill--average";
  return "pill--below";
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
          class="today-card__cta"
          onClick={() => browserAPI.tabs.create({ url: GAME_URLS[summary.gameType] })}
        >
          Play
        </button>
      </div>
    );
  }

  const session = summary.userSession!;
  const userMetric = getMetric(session);
  const histPercentile = computeHistoricalPercentile(summary);
  const friendsPercentile = summary.friendsSessions.length > 0
    ? computeFriendsPercentile(userMetric, summary.friendsSessions)
    : 0;

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
        <span class={`today-card__pill ${getPercentileClass(histPercentile)}`}>
          🏆 Top {formatPercentile(histPercentile)} all time
        </span>
        <span class={`today-card__pill ${getPercentileClass(friendsPercentile)}`}>
          👥 Top {formatPercentile(friendsPercentile)} friends
        </span>
      </div>
    </div>
  );
}
