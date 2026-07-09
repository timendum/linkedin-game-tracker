/**
 * Game Detail View - Container Component
 *
 * Fetches game detail data from the background service worker and orchestrates
 * child components (GameHeader, TodayStats, PersonalStatsRow, TrendSparkline,
 * FriendsLeaderboard). Manages loading, error, empty, and data states.
 */

import { useCallback, useEffect, useState } from "preact/hooks";
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

  const handleLinkClick = useCallback((e: Event) => {
    e.preventDefault();
    browserAPI.tabs.create({ url: linkUrl });
  }, [linkUrl]);

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
            <span key={pill.key} class={`today-card__pill ${pill.cssClass}`}>{pill.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

interface PersonalStatsRowProps {
  personalBest: number | null;
  median: number | null;
  gameType: GameType;
}

function PersonalStatsRow({ personalBest, median, gameType }: PersonalStatsRowProps) {
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
  dateColumnLabel: string;
}

function FriendsLeaderboard({ entries, gameType, dateColumnLabel }: FriendsLeaderboardProps) {
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
  ): string | undefined => {
    if (h2h === null) return undefined;
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
            <th title="Rank">#</th>
            <th>{dateColumnLabel}</th>
            <th title="Median">Mdn</th>
            <th title="Head to Head">H2H</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.playerName} class={entry.playerName === "You" ? "you-row" : ""}>
              <td>{entry.playerName}</td>
              <td>{index + 1}</td>
              <td>{formatTodayValue(entry.todayValue)}</td>
              <td>{formatMedian(entry.median)}</td>
              <td>
                <span title={formatH2HTitle(entry.h2h)}>{formatH2H(entry.h2h)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DayNavigatorProps {
  selectedDate: string | null;
  onDateChange: (date: string | null) => void;
}

function DayNavigator({ selectedDate, onDateChange }: DayNavigatorProps) {
  const today = Temporal.Now.plainDateISO();
  const selected = selectedDate ? Temporal.PlainDate.from(selectedDate) : null;

  const handlePrev = useCallback(() => {
    const base = selected ?? today;
    onDateChange(base.subtract({ days: 1 }).toString());
  }, [selected, today, onDateChange]);

  const handleNext = useCallback(() => {
    if (selected === null) return;
    const next = selected.add({ days: 1 });
    if (Temporal.PlainDate.compare(next, today) >= 0) {
      onDateChange(null);
    } else {
      onDateChange(next.toString());
    }
  }, [selected, onDateChange, today]);

  const handleReset = useCallback(() => {
    onDateChange(null);
  }, [onDateChange]);

  const isAtToday = selected === null;

  return (
    <div class="day-navigator">
      <button
        type="button"
        class="day-navigator__btn"
        onClick={handlePrev}
        aria-label="Previous day"
      >
        ←
      </button>
      <span class="day-navigator__label">
        {formatDateLabel((selected || today).toString())}
      </span>
      {isAtToday
        ? (
          <span class="day-navigator__btn day-navigator__btn--disabled" aria-disabled="true">
            →
          </span>
        )
        : (
          <button
            type="button"
            class="day-navigator__btn"
            onClick={handleNext}
            aria-label="Next day"
          >
            →
          </button>
        )}
      {!isAtToday && (
        <button
          type="button"
          class="day-navigator__btn day-navigator__btn--reset"
          onClick={handleReset}
          aria-label="Back to summary"
        >
          Today
        </button>
      )}
    </div>
  );
}

interface GameDetailViewProps {
  gameType: GameType;
  onBack: () => void;
}

function formatDateLabel(dateStr: string): string {
  const date = Temporal.PlainDate.from(dateStr);
  return date.toLocaleString(undefined, { day: "2-digit", month: "2-digit" });
}

const NO_LEADERBOARD: LeaderboardEntry[] = [];

export function GameDetailView({ gameType, onBack }: GameDetailViewProps) {
  const [data, setData] = useState<GameDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[] | null>(null);

  // Fetch main data (always for today)
  useEffect(() => {
    const todayDate = Temporal.Now.plainDateISO().toString();
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
        return;
      })
      .catch(() => {
        if (timedOut) return;
        clearTimeout(timeout);
        setError("Unable to load game data. Please try again.");
        setLoading(false);
        return;
      });

    return () => clearTimeout(timeout);
  }, [gameType]);

  // Fetch leaderboard for the selected date (only when navigating away from today)
  useEffect(() => {
    if (selectedDate === null) {
      setLeaderboardEntries(null);
      return;
    }

    browserAPI.runtime
      .sendMessage({
        type: MessageType.GET_GAME_DETAIL,
        gameType,
        date: selectedDate,
      })
      .then((response) => {
        const detail = response as GameDetailData;
        setLeaderboardEntries(detail.leaderboard);
        return;
      })
      .catch(() => {
        // On error, fall back to the main data's leaderboard
        setLeaderboardEntries(null);
      });
  }, [gameType, selectedDate]);

  const dateColumnLabel = selectedDate === null ? "Today" : formatDateLabel(selectedDate);
  const displayedLeaderboard = leaderboardEntries ?? (data?.leaderboard ?? NO_LEADERBOARD);

  return (
    <div class="game-detail">
      <button type="button" class="back-btn" onClick={onBack}>← Back</button>

      {loading && <div class="loading-indicator">Loading...</div>}

      {error && <p class="error-message">{error}</p>}

      {data && (
        <div class="detail-card">
          <GameHeader
            gameName={GAME_DISPLAY_NAMES[data.gameType]}
            gameType={data.gameType}
            todaySession={data.todaySession}
          />
        </div>
      )}

      {data && data.personalBest === null && (
        <>
          <div class="detail-card">
            <p class="empty-state-message">
              No game data yet. Play a LinkedIn game to begin tracking.
            </p>
          </div>
        </>
      )}

      {data && data.personalBest !== null && (
        <>
          <div class="detail-card">
            <TodayStats
              todaySession={data.todaySession}
              historyPercentile={data.historyPercentile}
              friendsPercentile={data.friendsPercentile}
            />
            <PersonalStatsRow
              personalBest={data.personalBest}
              median={data.median}
              gameType={data.gameType}
            />
          </div>
          {data.trendValues.filter((v) => v !== null).length > 4 && (
            <div class="detail-card">
              <TrendSparkline
                values={data.trendValues}
                days={data.trendDays}
              />
            </div>
          )}
          <div class="detail-card">
            <FriendsLeaderboard
              entries={displayedLeaderboard}
              gameType={data.gameType}
              dateColumnLabel={dateColumnLabel}
            />
            <DayNavigator
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
            />
          </div>
        </>
      )}
    </div>
  );
}
