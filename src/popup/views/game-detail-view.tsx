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
import { formatTodayResult, normalizeTrend } from "../../lib/game-detail-utils.ts";
import {
  buildPercentilePills,
  formatTime,
  GAME_DISPLAY_NAMES,
  GAME_URLS,
} from "../../lib/formatters.ts";

interface GameHeaderProps {
  gameName: string;
  onOpenChart: () => void;
  showChart: boolean;
  linkUrl?: string;
  linkLabel?: string;
  onLinkClick?: (e: Event) => void;
}

function GameHeader(
  { gameName, onOpenChart, showChart, linkUrl, linkLabel, onLinkClick }: GameHeaderProps,
) {
  return (
    <div class="game-header">
      <h2 class="game-header-name">{gameName}</h2>
      {linkUrl && (
        <a class="game-header-link" href={linkUrl} onClick={onLinkClick}>
          {linkLabel}
        </a>
      )}
      {showChart && (
        <button
          type="button"
          class="full-compare-btn"
          onClick={onOpenChart}
        >
          Full chart ↗
        </button>
      )}
    </div>
  );
}

interface TodayStatsProps {
  todaySession: GameSession | null;
}

function TodayStats(
  { todaySession }: TodayStatsProps,
) {
  const isPlayed = todaySession !== null && todaySession.completed;
  const todayResult = isPlayed ? formatTodayResult(todaySession) : "Not played";

  return (
    <div class="today-stats">
      <strong>Today</strong>
      <span class="today-stats-value">{todayResult}</span>
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
  gameType: GameType;
}

function TrendSparkline({ values, days, gameType }: TrendSparklineProps) {
  // Left-trim leading empty (null) days
  let trimStart = 0;
  while (trimStart < values.length && values[trimStart] === null) trimStart++;
  const trimmedValues = values.slice(trimStart);
  const trimmedDays = days - trimStart;

  const normalized = normalizeTrend(trimmedValues);
  const isTimeBased = gameType !== "pinpoint";

  return (
    <div class="trend-sparkline">
      <span class="trend-label">Last {trimmedDays}d Trend</span>
      <span class="trend-blocks">
        {normalized.map((v, i) => {
          const raw = trimmedValues[i];
          const tooltip = raw !== null ? (isTimeBased ? formatTime(raw) : String(raw)) : undefined;
          return (
            <span
              key={`day-${trimmedDays - i}`}
              class={`trend-bar${v === null ? " trend-bar--gap" : ""}`}
              // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop
              style={v !== null ? { height: `${((v + 1) / 8) * 100}%` } : undefined}
              title={tooltip}
            />
          );
        })}
      </span>
    </div>
  );
}

interface FriendsLeaderboardProps {
  entries: LeaderboardEntry[];
  gameType: GameType;
  dateColumnLabel: string;
  onCompare?: (friendName: string) => void;
}

function computeRank(entry: LeaderboardEntry, allEntries: LeaderboardEntry[]): number | null {
  if (entry.todayValue === null) return null;
  const betterCount =
    allEntries.filter((e) => e.todayValue !== null && e.todayValue < entry.todayValue!).length;
  return betterCount + 1;
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  rank: number | null;
  isTimeBased: boolean;
  onCompare?: (friendName: string) => void;
}

function LeaderboardRow({ entry, rank, isTimeBased, onCompare }: LeaderboardRowProps) {
  const isFriend = entry.playerName !== "You";

  const handleClick = useCallback((e: Event) => {
    e.preventDefault();
    onCompare?.(entry.playerName);
  }, [onCompare, entry.playerName]);

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
    <tr class={entry.playerName === "You" ? "you-row" : ""}>
      <td>
        {isFriend && onCompare
          ? (
            <a
              class="leaderboard-compare-link"
              href="#"
              onClick={handleClick}
              title={`Compare with ${entry.playerName}`}
            >
              {entry.playerName}
            </a>
          )
          : entry.playerName}
      </td>
      <td>{rank ?? "—"}</td>
      <td>{formatTodayValue(entry.todayValue)}</td>
      <td>{formatMedian(entry.median)}</td>
      <td>
        <span title={formatH2HTitle(entry.h2h)}>{formatH2H(entry.h2h)}</span>
      </td>
    </tr>
  );
}

function FriendsLeaderboard(
  { entries, gameType, dateColumnLabel, onCompare }: FriendsLeaderboardProps,
) {
  // Hide if only the "You" row exists (no friends data)
  if (entries.length <= 1) return null;

  const isTimeBased = gameType !== "pinpoint";

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
          {entries.map((entry) => (
            <LeaderboardRow
              key={entry.playerName}
              entry={entry}
              rank={computeRank(entry, entries)}
              isTimeBased={isTimeBased}
              onCompare={onCompare}
            />
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
    <>
      <button
        type="button"
        class="day-navigator-btn"
        onClick={handlePrev}
        aria-label="Previous day"
      >
        ←
      </button>
      <span class="day-navigator-label">
        {formatDateLabel((selected || today).toString())}
      </span>
      {isAtToday
        ? (
          <span class="day-navigator-btn day-navigator-btn--disabled" aria-disabled="true">
            →
          </span>
        )
        : (
          <button
            type="button"
            class="day-navigator-btn"
            onClick={handleNext}
            aria-label="Next day"
          >
            →
          </button>
        )}
      {!isAtToday && (
        <button
          type="button"
          class="day-navigator-btn day-navigator-btn--reset"
          onClick={handleReset}
          aria-label="Back to summary"
        >
          Today
        </button>
      )}
    </>
  );
}

interface GameDetailViewProps {
  gameType: GameType;
  onBack: () => void;
  onCompare?: (gameType: GameType, friendName: string) => void;
}

function formatDateLabel(dateStr: string): string {
  const date = Temporal.PlainDate.from(dateStr);
  return date.toLocaleString(undefined, { day: "2-digit", month: "2-digit" });
}

const NO_LEADERBOARD: LeaderboardEntry[] = [];

export function GameDetailView({ gameType, onBack, onCompare }: GameDetailViewProps) {
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

  const handleCompare = useCallback(
    (friendName: string) => {
      onCompare?.(gameType, friendName);
    },
    [onCompare, gameType],
  );

  const openChart = useCallback(() => {
    const chartUrl = browserAPI.runtime.getURL(`chart/index.html?gameType=${gameType}`);
    browserAPI.tabs.create({ url: chartUrl });
  }, [gameType]);

  const isPlayed = data?.todaySession !== null && data?.todaySession?.completed;
  const gameLinkUrl = isPlayed ? `${GAME_URLS[gameType]}/results/` : GAME_URLS[gameType];
  const gameLinkLabel = isPlayed ? "Results ↗" : "Play ↗";

  const handleGameLinkClick = useCallback((e: Event) => {
    e.preventDefault();
    browserAPI.tabs.create({ url: gameLinkUrl });
  }, [gameLinkUrl]);

  const openGameLink = useCallback((e: Event) => {
    e.preventDefault();
    if (data) {
      browserAPI.tabs.create({ url: GAME_URLS[data.gameType] });
    }
  }, [data]);

  return (
    <div class="game-detail">
      <button type="button" class="back-btn" onClick={onBack}>← Back</button>

      {loading && <div class="loading-indicator">Loading...</div>}

      {error && <p class="error-message">{error}</p>}

      {data && (
        <div class="detail-card">
          <GameHeader
            gameName={GAME_DISPLAY_NAMES[data.gameType]}
            onOpenChart={openChart}
            showChart={data.trendValues.filter((v) => v !== null).length >= 2}
            linkUrl={gameLinkUrl}
            linkLabel={gameLinkLabel}
            onLinkClick={handleGameLinkClick}
          />
          {data.personalBest === null
            ? (
              <div class="empty-state-row">
                <p class="empty-state-message">
                  No game data yet. Play a LinkedIn game to begin tracking.
                </p>
                <a
                  class="empty-state-link"
                  href={GAME_URLS[data.gameType]}
                  onClick={openGameLink}
                >
                  Play ↗
                </a>
              </div>
            )
            : (
              <>
                <TodayStats
                  todaySession={data.todaySession}
                />
                <PersonalStatsRow
                  personalBest={data.personalBest}
                  median={data.median}
                  gameType={data.gameType}
                />
                {data.trendValues.filter((v) => v !== null).length > 4 && (
                  <TrendSparkline
                    values={data.trendValues}
                    days={data.trendDays}
                    gameType={data.gameType}
                  />
                )}
                {(() => {
                  const pills = buildPercentilePills(
                    data.historyPercentile,
                    data.friendsPercentile,
                  );
                  return pills.length > 0
                    ? (
                      <div class="game-pills">
                        {pills.map((pill) => (
                          <span key={pill.key} class={`game-pill ${pill.cssClass}`}>
                            {pill.label}
                          </span>
                        ))}
                      </div>
                    )
                    : null;
                })()}
              </>
            )}
        </div>
      )}

      {data && data.personalBest !== null && (
        <div class="detail-card">
          <FriendsLeaderboard
            entries={displayedLeaderboard}
            gameType={data.gameType}
            dateColumnLabel={dateColumnLabel}
            onCompare={onCompare ? handleCompare : undefined}
          />
          <div class="day-navigator">
            <DayNavigator
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
