/**
 * Chart Tab Entry Point
 *
 * Renders a full-page rank chart for a given game type.
 * Reads `gameType` from the URL search params: chart/index.html?gameType=queens
 */

import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { GameType, RankHistoryData, TodaySummaryData } from "../lib/types.ts";
import { ALL_GAME_TYPES, MessageType } from "../lib/types.ts";
import { browserAPI } from "../lib/browser.ts";
import { formatTime, GAME_DISPLAY_NAMES, sortGameTypes } from "../lib/formatters.ts";
import {
  CategoryScale,
  Chart,
  Colors,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

Chart.register(
  Colors,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Legend,
  Tooltip,
);

/** Get the explicit game type from URL params, if valid */
function getGameTypeFromURL(): GameType | null {
  const params = new URLSearchParams(globalThis.location.search);
  const param = params.get("gameType") ?? "";
  if (ALL_GAME_TYPES.includes(param as GameType)) return param as GameType;
  return null;
}

function ChartPage() {
  const [selectedGame, setSelectedGame] = useState<GameType | null>(getGameTypeFromURL);
  const [sortedGameTypes, setSortedGameTypes] = useState<GameType[]>(ALL_GAME_TYPES);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch today summary once to determine dropdown order and default game
  useEffect(() => {
    browserAPI.runtime
      .sendMessage({ type: MessageType.GET_TODAY_SUMMARY })
      .then((response) => {
        const data = response as TodaySummaryData;
        if (data?.games?.length) {
          const sorted = sortGameTypes(data.games);
          setSortedGameTypes(sorted);
          // If no explicit URL param, pick the most-played game
          setSelectedGame((current) => current ?? sorted[0]);
        } else {
          // No data — fall back to random
          setSelectedGame((current) =>
            current ?? ALL_GAME_TYPES[Math.floor(Math.random() * ALL_GAME_TYPES.length)]
          );
        }
        return undefined;
      })
      .catch(() => {
        setSelectedGame((current) =>
          current ?? ALL_GAME_TYPES[Math.floor(Math.random() * ALL_GAME_TYPES.length)]
        );
      });
  }, []);

  useEffect(() => {
    if (!selectedGame) return;
    setLoading(true);
    setError(null);

    browserAPI.runtime
      .sendMessage({
        type: MessageType.GET_RANK_HISTORY,
        gameType: selectedGame,
        days: 14,
      })
      .then((response) => {
        const data = response as RankHistoryData;
        console.debug(data);
        setLoading(false);
        if (!canvasRef.current) return;

        if (chartRef.current) {
          chartRef.current.destroy();
        }

        const labels = data.players[0]?.ranks.map((r) => {
          const d = Temporal.PlainDate.from(r.date);
          return d.toLocaleString(undefined, { day: "2-digit", month: "2-digit" });
        }) ?? [];

        // Sort players: "You" first, then alphabetical
        const sortedPlayers = [...data.players].sort((a, b) => {
          if (a.playerName === "You") return -1;
          if (b.playerName === "You") return 1;
          return a.playerName.localeCompare(b.playerName);
        });

        const datasets = sortedPlayers.map((player) => ({
          label: player.playerName,
          data: player.ranks.map((r) => r.rank),
          values: player.ranks.map((r) => r.value),
          borderWidth: player.playerName === "You" ? 3 : 1.5,
          tension: 0.2,
          spanGaps: true,
          pointRadius: 2,
        }));

        /** Format a metric value for the tooltip based on game type */
        const formatValue = (v: number | null): string => {
          if (v === null) return "";
          if (selectedGame === "pinpoint") return `Score: ${v}`;
          return `Time: ${formatTime(v)}`;
        };

        chartRef.current = new Chart(canvasRef.current, {
          type: "line",
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                reverse: true,
                min: 0,
                title: { display: true, text: "Rank" },
              },
              x: {
                title: { display: false, text: "Day" },
              },
            },
            plugins: {
              legend: {
                display: true,
                position: "bottom",
                align: "start",
                labels: {
                  boxWidth: 10,
                },
              },
              tooltip: {
                mode: "nearest",
                axis: "xy",
                intersect: false,
                callbacks: {
                  label(ctx) {
                    const ds = ctx.dataset as unknown as { values: (number | null)[] };
                    const value = ds.values?.[ctx.dataIndex] ?? null;
                    const rankStr = `Rank: ${ctx.parsed.y}`;
                    const valueStr = formatValue(value);
                    return valueStr
                      ? `${ctx.dataset.label} — ${rankStr}, ${valueStr}`
                      : `${ctx.dataset.label} — ${rankStr}`;
                  },
                },
              },
            },
          },
        });
        return;
      })
      .catch(() => {
        setLoading(false);
        setError("Failed to load rank history.");
      });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [selectedGame]);

  const changeGame = useCallback(
    (e: preact.TargetedEvent<HTMLSelectElement>) =>
      setSelectedGame(e.currentTarget.value as GameType),
    [],
  );

  return (
    <div class="chart-page">
      <div class="chart-page-header">
        <h1 class="chart-page-title">Rank over time</h1>
        <select
          class="chart-page-game-select"
          value={selectedGame ?? ""}
          onChange={changeGame}
          aria-label="Select game"
        >
          {sortedGameTypes.map((gt) => <option key={gt} value={gt}>{GAME_DISPLAY_NAMES[gt]}
          </option>)}
        </select>
      </div>
      <div class="chart-page-card">
        {loading && <div class="loading-indicator">Loading chart...</div>}
        {error && <p class="error-message">{error}</p>}
        <div class="chart-canvas-wrapper">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
}

render(<ChartPage />, document.getElementById("app")!);
