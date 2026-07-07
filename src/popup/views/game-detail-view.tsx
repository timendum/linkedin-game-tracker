/**
 * Game Detail View - Container Component
 *
 * Fetches game detail data from the background service worker and orchestrates
 * child components (GameHeader, TodayStats, PersonalStatsRow, TrendSparkline,
 * FriendsLeaderboard). Manages loading, error, empty, and data states.
 */

import { useEffect, useState } from "preact/hooks";
import type { GameDetailData, GameSession, GameType, LeaderboardEntry } from "../../lib/types.ts";
import { MessageType } from "../../lib/types.ts";
import { browserAPI } from "../../lib/browser.ts";
import { formatTodayResult, normalizeTrend, valueToBlock } from "../../lib/game-detail-utils.ts";
import { buildPercentilePills, GAME_DISPLAY_NAMES, GAME_URLS } from "../../lib/formatters.ts";

interface GameHeaderProps {
  gameName: string;
  gameType: GameType;
  todaySession: GameSession | null;
}

function GameHeader({ gameName, gameType, todaySession }: GameHeaderProps) {
  const isPlayed = todaySession !== null && todaySession.completed;
  const linkUrl = isPlayed ? `${GAME_URLS[gameType]}/results/` : GAME_URLS[gameType];
  const linkLabel = isPlayed ? "Results ↗" : "Play ↗";

  const handleLinkClick = (e: Event) => {
    e.preventDefault();
    browserAPI.tabs.create({ url: linkUrl });
  };

  return (
    <div class="game-header-wrapper">
      <div class="game-header">
        <h2 class="game-name">{gameName}</h2>
        <a class="game-header__link" href={linkUrl} onClick={handleLinkClick}>
          {linkLabel}
        </a>
      </div>
    </div>
  );
}

interface TodayStatsProps {
  todaySession: GameSession | null;
  historyPercentile: number;
  friendsPercentile: number | null;
}

function TodayStats({ todaySession, historyPercentile, friendsPercentile }: TodayStatsProps) {
  const isPlayed = todaySession !== null && todaySession.completed;
  const todayResult = isPlayed ? formatTodayResult(todaySession) : "Not played";
  const pills = buildPercentilePills(historyPercentile, friendsPercentile);

  return (
    <div class="today-stats">
      <div class="today-stats__result">
        <strong>Today</strong> {todayResult}
      </div>
      {pills.length > 0 && (
        <div class="today-stats__pills">
          {pills.map((pill) => (
            <span class={`today-card__pill ${pill.cssClass}`}>{pill.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

interface PersonalStatsRowProps {
  personalBest: number | null;
  median: number | null;
  totalGames: number;
  gameType: GameType;
}

function PersonalStatsRow({ personalBest, median, totalGames, gameType }: PersonalStatsRowProps) {
  const isTimeBased = gameType !== "pinpoint";

  const formatValue = (value: number | null, isForPB: boolean): string => {
    if (value === null) return "—";
    if (isTimeBased) {
      if (value < 60) return `${value}s`;
      const m = Math.floor(value / 60);
      const s = value % 60;
      return `${m}m ${s}s`;
    }
    // Score-based (pinpoint)
    if (isForPB) {
      return value === 1 ? "1 guess" : `${value} guesses`;
    }
    // Median for score-based: show as decimal
    return value.toFixed(1);
  };

  return (
    <div class="personal-stats-row">
      <strong>Personal Best</strong> {formatValue(personalBest, true)}
      <strong>Median</strong> {formatValue(median, false)}
      <span title="Number of Games">
        <strong>Games</strong> {totalGames}
      </span>
    </div>
  );
}

interface TrendSparklineProps {
  values: (number | null)[];
  days: number;
}

function TrendSparkline({ values, days }: TrendSparklineProps) {
  const normalized = normalizeTrend(values);
  const blocks = normalized.map(valueToBlock).join("");

  return (
    <div class="trend-sparkline">
      <span class="trend-label">{days}d Trend</span>
      <span class="trend-blocks">{blocks}</span>
    </div>
  );
}

interface FriendsLeaderboardProps {
  entries: LeaderboardEntry[];
  gameType: GameType;
}

function FriendsLeaderboard({ entries, gameType }: FriendsLeaderboardProps) {
  // Hide if only the "You" row exists (no friends data)
  if (entries.length <= 1) return null;

  const isTimeBased = gameType !== "pinpoint";

  const formatTodayValue = (value: number | null): string => {
    if (value === null) return "—";
    if (isTimeBased) {
      if (value < 60) return `${value}s`;
      const m = Math.floor(value / 60);
      const s = value % 60;
      return `${m}m ${s}s`;
    }
    return String(value);
  };

  const formatMedian = (value: number | null): string => {
    if (value === null) return "—";
    if (isTimeBased) {
      if (value < 60) return `${value}s`;
      const m = Math.floor(value / 60);
      const s = value % 60;
      return `${m}m ${s}s`;
    }
    return value.toFixed(1);
  };

  const formatH2H = (h2h: { wins: number; losses: number; ties: number } | null): string => {
    if (h2h === null) return "—";
    const base = `${h2h.wins}/${h2h.losses}`;
    return h2h.ties > 0 ? `${base} (${h2h.ties})` : base;
  };
  const formatH2HTitle = (
    h2h: { wins: number; losses: number; ties: number } | null,
  ): string | null => {
    if (h2h === null) return null;
    const tiers = [];
    if (h2h.wins > 0) tiers.push(`${h2h.wins} wins`);
    if (h2h.losses > 0) tiers.push(`${h2h.losses} loses`);
    if (h2h.ties > 0) tiers.push(`${h2h.ties} ties`);
    return tiers.join(", ");
  };

  return (
    <div class="friends-leaderboard">
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Today</th>
            <th title="Median">Mdn</th>
            <th title="Number of Games">Gms</th>
            <th title="Head to Head">H2H</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.playerName} class={entry.playerName === "You" ? "you-row" : ""}>
              <td>{entry.playerName}</td>
              <td>{formatTodayValue(entry.todayValue)}</td>
              <td>{formatMedian(entry.median)}</td>
              <td>{entry.totalGames}</td>
              <td>
                <span title={formatH2HTitle(entry.h2h) ?? undefined}>{formatH2H(entry.h2h)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface GameDetailViewProps {
  gameType: GameType;
  onBack: () => void;
}

export function GameDetailView({ gameType, onBack }: GameDetailViewProps) {
  const [data, setData] = useState<GameDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const todayDate = new Date().toISOString().split("T")[0];
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      setError("Unable to load game data. Please try again.");
    }, 5000);

    browserAPI.runtime
      .sendMessage({
        type: MessageType.GET_GAME_DETAIL,
        gameType,
        date: todayDate,
      })
      .then((response) => {
        if (timedOut) return;
        clearTimeout(timeout);
        setData(response as GameDetailData);
        setLoading(false);
      })
      .catch(() => {
        if (timedOut) return;
        clearTimeout(timeout);
        setError("Unable to load game data. Please try again.");
        setLoading(false);
      });

    return () => clearTimeout(timeout);
  }, [gameType]);

  return (
    <div class="game-detail">
      <button type="button" class="back-btn" onClick={onBack}>← Back</button>

      {loading && <div class="loading-indicator">Loading...</div>}

      {error && <p class="error-message">{error}</p>}

      {data && data.totalGames === 0 && (
        <>
          <div class="detail-card">
            <GameHeader
              gameName={GAME_DISPLAY_NAMES[data.gameType]}
              gameType={data.gameType}
              todaySession={data.todaySession}
            />
          </div>
          <div class="detail-card">
            <p class="empty-state-message">
              No game data yet. Play a LinkedIn game to begin tracking.
            </p>
          </div>
        </>
      )}

      {data && data.totalGames > 0 && (
        <>
          <div class="detail-card">
            <GameHeader
              gameName={GAME_DISPLAY_NAMES[data.gameType]}
              gameType={data.gameType}
              todaySession={data.todaySession}
            />
          </div>
          <div class="detail-card">
            <TodayStats
              todaySession={data.todaySession}
              historyPercentile={data.historyPercentile}
              friendsPercentile={data.friendsPercentile}
            />
            <PersonalStatsRow
              personalBest={data.personalBest}
              median={data.median}
              totalGames={data.totalGames}
              gameType={data.gameType}
            />
          </div>
          {data.totalGames > 4 && (
            <div class="detail-card">
              <TrendSparkline
                values={data.trendValues}
                days={data.trendDays}
              />
            </div>
          )}
          <div class="detail-card">
            <FriendsLeaderboard
              entries={data.leaderboard}
              gameType={data.gameType}
            />
          </div>
        </>
      )}
    </div>
  );
}
