/**
 * Chart Tab Entry Point
 *
 * Renders a full-page rank chart for a given game type.
 * Reads `gameType` from the URL search params: chart/index.html?gameType=queens
 */

import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { GameType, RankHistoryData } from "../lib/types.ts";
import { GAME_URL_PATHS, MessageType } from "../lib/types.ts";
import { browserAPI } from "../lib/browser.ts";
import { GAME_DISPLAY_NAMES } from "../lib/formatters.ts";
import { formatTime } from "../lib/formatters.ts";
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

/** All game types as an ordered array for the dropdown */
const ALL_GAME_TYPES: GameType[] = Object.values(GAME_URL_PATHS);

/** Pick a random game type */
function randomGameType(): GameType {
  return ALL_GAME_TYPES[Math.floor(Math.random() * ALL_GAME_TYPES.length)];
}

/** Determine the initial game from the URL or fall back to random */
function getInitialGameType(): GameType {
  const params = new URLSearchParams(globalThis.location.search);
  const param = params.get("gameType") ?? "";
  if (ALL_GAME_TYPES.includes(param as GameType)) return param as GameType;
  return randomGameType();
}

function ChartPage() {
  const [selectedGame, setSelectedGame] = useState<GameType>(getInitialGameType);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
    [setSelectedGame],
  );

  return (
    <div class="chart-page">
      <div class="chart-page-header">
        <h1 class="chart-page-title">Rank over time</h1>
        <select
          class="chart-page-game-select"
          value={selectedGame}
          onChange={changeGame}
          aria-label="Select game"
        >
          {ALL_GAME_TYPES.map((gt) => <option key={gt} value={gt}>{GAME_DISPLAY_NAMES[gt]}
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
