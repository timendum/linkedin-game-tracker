/**
 * Compare Page Entry Point
 *
 * Renders a full-page 1 vs 1 comparison across all game types.
 * Reads `friendName` from the URL search params: compare/index.html?friendName=Alice
 * If no friendName is provided, picks a random friend from the database.
 *
 * Reuses the same messaging pattern as chart/main.tsx — sends GET_COMPARISON
 * for each game type and aggregates the results.
 */

import { render } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComparisonData, GameType, H2HRecord } from "../lib/types.ts";
import { GAME_URL_PATHS, MessageType } from "../lib/types.ts";
import { browserAPI } from "../lib/browser.ts";
import { formatTime, GAME_DISPLAY_NAMES } from "../lib/formatters.ts";

/** All game types as an ordered array */
const ALL_GAME_TYPES: GameType[] = Object.values(GAME_URL_PATHS);

/** Get the friend name from URL params */
function getFriendNameFromURL(): string | null {
  const params = new URLSearchParams(globalThis.location.search);
  return params.get("friendName");
}

/** Fetch all friend names from the background service worker */
async function fetchAllFriends(): Promise<string[]> {
  const response = await browserAPI.runtime.sendMessage({
    type: MessageType.GET_ALL_FRIENDS,
  });
  return (response as string[]) ?? [];
}

function ComparePage() {
  const [allFriends, setAllFriends] = useState<string[]>([]);
  const [friendName, setFriendName] = useState<string | null>(getFriendNameFromURL());
  const [results, setResults] = useState<Map<GameType, ComparisonData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all friend names on mount
  useEffect(() => {
    fetchAllFriends().then((friends) => {
      setAllFriends(friends);
      // If no friend was specified in URL, pick a random one
      if (!getFriendNameFromURL() && friends.length > 0) {
        const randomFriend = friends[Math.floor(Math.random() * friends.length)];
        setFriendName(randomFriend);
      } else if (!getFriendNameFromURL() && friends.length === 0) {
        setError("No friends found in database.");
        setLoading(false);
      }
      return null;
    }).catch(() => {
      setError("Failed to load friend names.");
      setLoading(false);
    });
  }, []);

  // Fetch comparison data whenever friendName changes
  useEffect(() => {
    if (!friendName) return;

    setLoading(true);
    setError(null);

    const promises = ALL_GAME_TYPES.map((gameType) =>
      browserAPI.runtime
        .sendMessage({
          type: MessageType.GET_COMPARISON,
          gameType,
          friendName,
        })
        .then((response) => ({ gameType, data: response as ComparisonData }))
        .catch(() => ({ gameType, data: null }))
    );

    Promise.all(promises).then((responses) => {
      const map = new Map<GameType, ComparisonData>();
      for (const { gameType, data } of responses) {
        if (data) map.set(gameType, data);
      }
      setResults(map);
      setLoading(false);
      return;
    }).catch(() => {
      setError("Failed to load comparison data.");
      setLoading(false);
    });
  }, [friendName]);

  const handleFriendSelect = useCallback((name: string) => {
    setFriendName(name);
    // Update URL without reload
    const url = new URL(globalThis.location.href);
    url.searchParams.set("friendName", name);
    globalThis.history.replaceState(null, "", url.toString());
  }, []);

  // Compute overall H2H across all games
  const overallH2H = useMemo(() => {
    const oH2H: H2HRecord = { wins: 0, losses: 0, ties: 0 };
    for (const data of results.values()) {
      oH2H.wins += data.h2h.wins;
      oH2H.losses += data.h2h.losses;
      oH2H.ties += data.h2h.ties;
    }
    return oH2H;
  }, [results]);

  const totalGames = overallH2H.wins + overallH2H.losses + overallH2H.ties;
  const overallWinRate = totalGames > 0 ? Math.round((overallH2H.wins / totalGames) * 100) : 0;

  return (
    <div class="compare-page">
      <div class="compare-page-header">
        <h1 class="compare-page-title">
          You vs
        </h1>
        <FriendAutocomplete
          friends={allFriends}
          value={friendName ?? ""}
          onSelect={handleFriendSelect}
        />
        <span class="compare-page-subtitle">All games head-to-head</span>
      </div>

      {loading && <div class="loading-indicator">Loading comparison data...</div>}
      {error && <p class="error-message">{error}</p>}

      {!loading && !error && (
        <>
          <OverallSummary h2h={overallH2H} winRate={overallWinRate} total={totalGames} />

          <OutcomeChart results={results} />

          <div class="compare-page-games">
            {ALL_GAME_TYPES.map((gameType) => {
              const data = results.get(gameType);
              return <GameCard key={gameType} gameType={gameType} data={data ?? null} />;
            })}
          </div>
        </>
      )}
    </div>
  );
}

// --- Autocomplete Component ---

function FriendAutocomplete(
  { friends, value, onSelect }: {
    friends: string[];
    value: string;
    onSelect: (name: string) => void;
  },
) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filtered = useMemo(() => {
    if (!inputValue) return friends;
    const lower = inputValue.toLowerCase();
    return friends.filter((f) => f.toLowerCase().includes(lower));
  }, [friends, inputValue]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: Event) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectItem = useCallback((name: string) => {
    setInputValue(name);
    setIsOpen(false);
    setHighlightedIndex(-1);
    onSelect(name);
  }, [onSelect]);

  const handleInput = useCallback((e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    setInputValue(val);
    setIsOpen(true);
    setHighlightedIndex(-1);
  }, []);

  const handleFocus = useCallback(() => {
    setInputValue("");
    setIsOpen(true);
  }, []);

  const handleMouseDown = useCallback((e: Event) => {
    e.preventDefault();
    const name = (e.currentTarget as HTMLElement).dataset.name;
    if (name) selectItem(name);
  }, [selectItem]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          selectItem(filtered[highlightedIndex]);
        } else if (filtered.length === 1) {
          selectItem(filtered[0]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  }, [isOpen, filtered, highlightedIndex, selectItem]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const listboxId = "friend-autocomplete-listbox";

  return (
    <div class="friend-autocomplete" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        class="friend-autocomplete-input"
        value={inputValue}
        onInput={handleInput}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder="Search friend..."
        role="combobox"
        aria-expanded={isOpen && filtered.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={highlightedIndex >= 0
          ? `friend-option-${highlightedIndex}`
          : undefined}
        aria-autocomplete="list"
        autocomplete="off"
      />
      {isOpen && filtered.length > 0 && (
        <ul
          ref={listRef}
          id={listboxId}
          class="friend-autocomplete-list"
          role="listbox"
        >
          {filtered.map((name, i) => (
            <li
              key={name}
              id={`friend-option-${i}`}
              class={`friend-autocomplete-item${
                i === highlightedIndex ? " friend-autocomplete-item--highlighted" : ""
              }`}
              role="option"
              aria-selected={i === highlightedIndex}
              data-name={name}
              onMouseDown={handleMouseDown}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Sub-components ---

function OverallSummary(
  { h2h, winRate, total }: { h2h: H2HRecord; winRate: number; total: number },
) {
  return (
    <div class="compare-page-overall">
      <div class="compare-page-overall-title">Overall Record</div>
      <div class="compare-page-overall-stats">
        <div class="compare-page-overall-record">
          <span class="compare-page-overall-win">{h2h.wins}W</span>
          <span class="compare-page-overall-separator">–</span>
          <span class="compare-page-overall-loss">{h2h.losses}L</span>
          {h2h.ties > 0 && (
            <>
              <span class="compare-page-overall-separator">–</span>
              <span class="compare-page-overall-tie">{h2h.ties}T</span>
            </>
          )}
        </div>

        {total > 0 && (
          <div class="compare-page-overall-bar">
            <div
              class="compare-page-overall-bar-wins"
              // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop
              style={{ width: `${(h2h.wins / total) * 100}%` }}
            />
            {h2h.ties > 0 && (
              <div
                class="compare-page-overall-bar-ties"
                // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop
                style={{ width: `${(h2h.ties / total) * 100}%` }}
              />
            )}
            <div
              class="compare-page-overall-bar-losses"
              // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop
              style={{ width: `${(h2h.losses / total) * 100}%` }}
            />
          </div>
        )}

        <span class="compare-page-overall-rate">
          {total > 0 ? `${winRate}% win rate over ${total} games` : "No common games yet"}
        </span>
      </div>
    </div>
  );
}

function OutcomeChart({ results }: { results: Map<GameType, ComparisonData> }) {
  // Collect all unique dates across all games, sorted ascending
  const dateSet = new Set<string>();
  for (const data of results.values()) {
    for (const day of data.dailyResults) {
      dateSet.add(day.date);
    }
  }
  const dates = [...dateSet].sort();

  if (dates.length === 0) {
    return (
      <div class="compare-page-heatmap">
        <div class="compare-page-heatmap-title">Daily Outcomes</div>
        <div class="compare-page-heatmap-empty">No daily data yet</div>
      </div>
    );
  }

  // Format date labels
  const dateLabels = dates.map((d) => {
    const pd = Temporal.PlainDate.from(d);
    return pd.toLocaleString(undefined, { day: "2-digit", month: "2-digit" });
  });

  // Determine which game types have data
  const activeGameTypes = ALL_GAME_TYPES.filter((gt) => results.has(gt));

  // Build a lookup: gameType → date → outcome
  const outcomeMap = new Map<GameType, Map<string, string>>();
  for (const gt of activeGameTypes) {
    const data = results.get(gt)!;
    const dayMap = new Map<string, string>();
    for (const day of data.dailyResults) {
      dayMap.set(day.date, day.outcome);
    }
    outcomeMap.set(gt, dayMap);
  }

  return (
    <div class="compare-page-heatmap">
      <div class="compare-page-heatmap-title">Daily Outcomes</div>
      <div class="compare-page-heatmap-scroll">
        <table class="heatmap-grid" role="grid" aria-label="Daily outcomes heatmap">
          <thead>
            <tr>
              <th class="heatmap-grid-corner"></th>
              {dates.map((date, i) => (
                <th key={date} class="heatmap-grid-date-header" title={date}>
                  {dateLabels[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeGameTypes.map((gt) => {
              const dayMap = outcomeMap.get(gt)!;
              return (
                <tr key={gt}>
                  <td class="heatmap-grid-game-label">{GAME_DISPLAY_NAMES[gt]}</td>
                  {dates.map((date) => {
                    const outcome = dayMap.get(date) ?? null;
                    const cellClass = outcome
                      ? `heatmap-grid-cell heatmap-grid-cell--${outcome}`
                      : "heatmap-grid-cell heatmap-grid-cell--empty";
                    const label = outcome === "win"
                      ? "Win"
                      : outcome === "loss"
                      ? "Loss"
                      : outcome === "tie"
                      ? "Tie"
                      : "No data";
                    return (
                      <td
                        key={date}
                        class={cellClass}
                        title={`${GAME_DISPLAY_NAMES[gt]} – ${date}: ${label}`}
                        aria-label={`${GAME_DISPLAY_NAMES[gt]} on ${date}: ${label}`}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div class="heatmap-grid-legend">
        <span class="heatmap-grid-legend-item">
          <span class="heatmap-grid-legend-swatch heatmap-grid-legend-swatch--win" /> Win
        </span>
        <span class="heatmap-grid-legend-item">
          <span class="heatmap-grid-legend-swatch heatmap-grid-legend-swatch--loss" /> Loss
        </span>
        <span class="heatmap-grid-legend-item">
          <span class="heatmap-grid-legend-swatch heatmap-grid-legend-swatch--tie" /> Tie
        </span>
        <span class="heatmap-grid-legend-item">
          <span class="heatmap-grid-legend-swatch heatmap-grid-legend-swatch--empty" /> No data
        </span>
      </div>
    </div>
  );
}

function GameCard(
  { gameType, data }: { gameType: GameType; data: ComparisonData | null },
) {
  const gameName = GAME_DISPLAY_NAMES[gameType];
  const isTimeBased = gameType !== "pinpoint";

  if (!data || (data.userSessionCount === 0 && data.friendSessionCount === 0)) {
    return (
      <div class="game-card">
        <div class="game-card-header">
          <span class="game-card-name">{gameName}</span>
        </div>
        <div class="game-card-empty">No data yet</div>
      </div>
    );
  }

  const { h2h } = data;
  const total = h2h.wins + h2h.losses + h2h.ties;

  const formatMetric = (value: number | null): string => {
    if (value === null) return "—";
    if (isTimeBased) return formatTime(value);
    return String(value);
  };

  const highlightClass = (own: number | null, other: number | null): string => {
    if (own === null || other === null) return "";
    if (own < other) return "better";
    if (own > other) return "worse";
    return "";
  };

  return (
    <div class="game-card">
      <div class="game-card-header">
        <span class="game-card-name">{gameName}</span>
        {total > 0 && (
          <span class="game-card-record">
            <span class="game-card-win">{h2h.wins}W</span>
            <span class="game-card-separator">–</span>
            <span class="game-card-loss">{h2h.losses}L</span>
            {h2h.ties > 0 && (
              <>
                <span class="game-card-separator">–</span>
                <span class="game-card-tie">{h2h.ties}T</span>
              </>
            )}
          </span>
        )}
      </div>

      <table class="game-card-stats">
        <thead>
          <tr>
            <th></th>
            <th>You</th>
            <th>{data.friendName}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Best</td>
            <td class={highlightClass(data.userPersonalBest, data.friendPersonalBest)}>
              {formatMetric(data.userPersonalBest)}
            </td>
            <td class={highlightClass(data.friendPersonalBest, data.userPersonalBest)}>
              {formatMetric(data.friendPersonalBest)}
            </td>
          </tr>
          <tr>
            <td>Median</td>
            <td class={highlightClass(data.userMedian, data.friendMedian)}>
              {formatMetric(data.userMedian)}
            </td>
            <td class={highlightClass(data.friendMedian, data.userMedian)}>
              {formatMetric(data.friendMedian)}
            </td>
          </tr>
          <tr>
            <td>Played</td>
            <td>{data.userSessionCount}</td>
            <td>{data.friendSessionCount}</td>
          </tr>
        </tbody>
      </table>

      {total > 0 && (
        <div class="game-card-bar">
          <div
            class="game-card-bar-wins"
            // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop
            style={{ width: `${(h2h.wins / total) * 100}%` }}
          />
          {h2h.ties > 0 && (
            <div
              class="game-card-bar-ties"
              // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop
              style={{ width: `${(h2h.ties / total) * 100}%` }}
            />
          )}
          <div
            class="game-card-bar-losses"
            // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop
            style={{ width: `${(h2h.losses / total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

render(<ComparePage />, document.getElementById("app")!);
