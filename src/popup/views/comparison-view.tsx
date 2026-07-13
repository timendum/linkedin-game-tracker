/**
 * Comparison View Component
 *
 * Shows a detailed head-to-head comparison between the user and a selected friend
 * for a specific game type. Includes H2H record, side-by-side stats, and a
 * 14-day daily results timeline.
 */

import { useEffect, useState } from "preact/hooks";
import type { ComparisonData, DailyComparison, GameType } from "../../lib/types.ts";
import { MessageType } from "../../lib/types.ts";
import { browserAPI } from "../../lib/browser.ts";
import { formatTime, GAME_DISPLAY_NAMES } from "../../lib/formatters.ts";

interface ComparisonViewProps {
  gameType: GameType;
  friendName: string;
  onBack: () => void;
}

export function ComparisonView({ gameType, friendName, onBack }: ComparisonViewProps) {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      setError("Unable to load comparison data. Please try again.");
    }, 5000);

    browserAPI.runtime
      .sendMessage({
        type: MessageType.GET_COMPARISON,
        gameType,
        friendName,
      })
      .then((response) => {
        if (timedOut) return;
        clearTimeout(timeout);
        setData(response as ComparisonData);
        setLoading(false);
        return;
      })
      .catch(() => {
        if (timedOut) return;
        clearTimeout(timeout);
        setError("Unable to load comparison data. Please try again.");
        setLoading(false);
        return;
      });

    return () => clearTimeout(timeout);
  }, [gameType, friendName]);

  return (
    <div class="comparison-view">
      <button type="button" class="back-btn" onClick={onBack}>← Back</button>

      {loading && <div class="loading-indicator">Loading...</div>}
      {error && <p class="error-message">{error}</p>}

      {data && (
        <>
          <div class="detail-card">
            <ComparisonHeader
              gameName={GAME_DISPLAY_NAMES[gameType]}
              friendName={data.friendName}
            />
          </div>

          <div class="detail-card">
            <H2HSummary h2h={data.h2h} friendName={data.friendName} />
          </div>

          <div class="detail-card">
            <StatsComparison data={data} />
          </div>

          {data.dailyResults.some((d) => d.outcome !== "incomplete") && (
            <div class="detail-card">
              <DailyTimeline results={data.dailyResults} gameType={gameType} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Internal Components ---

function ComparisonHeader(
  { gameName, friendName }: { gameName: string; friendName: string },
) {
  return (
    <div class="comparison-header">
      <h2 class="comparison-header__title">{gameName}</h2>
      <span class="comparison-header__subtitle">You vs {friendName}</span>
    </div>
  );
}

function H2HSummary(
  { h2h, friendName }: { h2h: ComparisonData["h2h"]; friendName: string },
) {
  const total = h2h.wins + h2h.losses + h2h.ties;
  const winRate = total > 0 ? Math.round((h2h.wins / total) * 100) : 0;

  return (
    <div class="h2h-summary">
      <div class="h2h-summary__record">
        <span class="h2h-summary__win">{h2h.wins}W</span>
        <span class="h2h-summary__separator">–</span>
        <span class="h2h-summary__loss">{h2h.losses}L</span>
        {h2h.ties > 0 && (
          <>
            <span class="h2h-summary__separator">–</span>
            <span class="h2h-summary__tie">{h2h.ties}T</span>
          </>
        )}
      </div>
      <div class="h2h-summary__bar">
        {total > 0 && (
          <>
            <div
              class="h2h-summary__bar-wins"
              style={{ width: `${(h2h.wins / total) * 100}%` }}
              title={`You: ${h2h.wins} wins`}
            />
            {h2h.ties > 0 && (
              <div
                class="h2h-summary__bar-ties"
                style={{ width: `${(h2h.ties / total) * 100}%` }}
                title={`Ties: ${h2h.ties}`}
              />
            )}
            <div
              class="h2h-summary__bar-losses"
              style={{ width: `${(h2h.losses / total) * 100}%` }}
              title={`${friendName}: ${h2h.losses} wins`}
            />
          </>
        )}
      </div>
      <span class="h2h-summary__rate">
        {total > 0 ? `${winRate}% win rate over ${total} games` : "No common games yet"}
      </span>
    </div>
  );
}

function StatsComparison({ data }: { data: ComparisonData }) {
  const isTimeBased = data.gameType !== "pinpoint";

  const formatMetric = (value: number | null): string => {
    if (value === null) return "—";
    if (isTimeBased) return formatTime(value);
    return String(value);
  };

  return (
    <div class="stats-comparison">
      <table class="stats-comparison__table">
        <thead>
          <tr>
            <th></th>
            <th>You</th>
            <th>{data.friendName}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="stats-comparison__label">Personal Best</td>
            <td class={highlight(data.userPersonalBest, data.friendPersonalBest, true)}>
              {formatMetric(data.userPersonalBest)}
            </td>
            <td class={highlight(data.friendPersonalBest, data.userPersonalBest, true)}>
              {formatMetric(data.friendPersonalBest)}
            </td>
          </tr>
          <tr>
            <td class="stats-comparison__label">Median</td>
            <td class={highlight(data.userMedian, data.friendMedian, true)}>
              {formatMetric(data.userMedian)}
            </td>
            <td class={highlight(data.friendMedian, data.userMedian, true)}>
              {formatMetric(data.friendMedian)}
            </td>
          </tr>
          <tr>
            <td class="stats-comparison__label">Games Played</td>
            <td>{data.userSessionCount}</td>
            <td>{data.friendSessionCount}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Returns a CSS class to highlight the better value (lower is better) */
function highlight(own: number | null, other: number | null, lowerIsBetter: boolean): string {
  if (own === null || other === null) return "";
  if (lowerIsBetter) {
    if (own < other) return "stats-comparison__better";
    if (own > other) return "stats-comparison__worse";
  } else {
    if (own > other) return "stats-comparison__better";
    if (own < other) return "stats-comparison__worse";
  }
  return "";
}

function DailyTimeline(
  { results, gameType }: { results: DailyComparison[]; gameType: GameType },
) {
  const isTimeBased = gameType !== "pinpoint";

  const formatValue = (v: number | null): string => {
    if (v === null) return "—";
    if (isTimeBased) return formatTime(v);
    return String(v);
  };

  return (
    <div class="daily-timeline">
      <span class="daily-timeline__title">Last 14 Days</span>
      <div class="daily-timeline__grid">
        {results.map((day) => {
          const dateObj = Temporal.PlainDate.from(day.date);
          const label = dateObj.toLocaleString(undefined, { day: "2-digit", month: "2-digit" });
          return (
            <div
              key={day.date}
              class={`daily-timeline__cell daily-timeline__cell--${day.outcome}`}
              title={`${label}: You ${formatValue(day.userValue)} / Friend ${
                formatValue(day.friendValue)
              }`}
            />
          );
        })}
      </div>
      <div class="daily-timeline__legend">
        <span class="daily-timeline__legend-item">
          <span class="daily-timeline__dot daily-timeline__dot--win" /> Win
        </span>
        <span class="daily-timeline__legend-item">
          <span class="daily-timeline__dot daily-timeline__dot--loss" /> Loss
        </span>
        <span class="daily-timeline__legend-item">
          <span class="daily-timeline__dot daily-timeline__dot--tie" /> Tie
        </span>
        <span class="daily-timeline__legend-item">
          <span class="daily-timeline__dot daily-timeline__dot--incomplete" /> N/A
        </span>
      </div>
    </div>
  );
}
