/**
 * Popup UI Main Entry Point
 *
 * Renders the Preact app into the #app container.
 * Uses state-driven navigation between Today Summary and per-game views.
 */

import { render } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import type { GameType, TodaySummaryData } from "../lib/types.ts";
import { MessageType } from "../lib/types.ts";
import { browserAPI } from "../lib/browser.ts";
import { TodaySummary } from "./views/today-view.tsx";
import { GameDetailView } from "./views/game-detail-view.tsx";
import { ComparisonView } from "./views/comparison-view.tsx";

type View =
  | { kind: "today" }
  | { kind: "game"; gameType: GameType }
  | { kind: "compare"; gameType: GameType; friendName: string };

function App() {
  const [view, setView] = useState<View>({ kind: "today" });
  const [todayData, setTodayData] = useState<TodaySummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load today summary on mount
  useEffect(() => {
    const todayDate = new Date().toISOString().split("T")[0];
    browserAPI.runtime.sendMessage({
      type: MessageType.GET_TODAY_SUMMARY,
      date: todayDate,
    }).then((data) => {
      return setTodayData(data as TodaySummaryData);
    }).catch((err) => {
      console.error("Failed to load today's summary:", err);
      setError("Unable to load today's summary.");
    });
  }, []);

  // Listen for browser back navigation (Alt+Left, mouse back button, etc.)
  useEffect(() => {
    const onPopState = () => {
      setView((prev) => {
        if (prev.kind === "compare") {
          return { kind: "game", gameType: prev.gameType };
        }
        return { kind: "today" };
      });
      setError(null);
    };
    globalThis.addEventListener("popstate", onPopState);
    return () => globalThis.removeEventListener("popstate", onPopState);
  }, []);

  const handleGameSelect = useCallback((gameType: GameType) => {
    setError(null);
    history.pushState({ kind: "game", gameType }, "");
    setView({ kind: "game", gameType });
  }, [setView, setError]);

  const handleBack = useCallback(() => {
    // Use history.back() so the popstate listener handles state transition
    history.back();
  }, []);

  const handleCompare = useCallback((gameType: GameType, friendName: string) => {
    setError(null);
    history.pushState({ kind: "compare", gameType, friendName }, "");
    setView({ kind: "compare", gameType, friendName });
  }, [setView, setError]);

  const openSettings = useCallback(() => {
    const url = browserAPI.runtime.getURL("settings/index.html");
    globalThis.location.assign(url);
  }, []);

  const openCompare = useCallback(() => {
    const url = browserAPI.runtime.getURL("compare/index.html");
    browserAPI.tabs.create({ url });
  }, []);

  const openChart = useCallback(() => {
    const url = browserAPI.runtime.getURL("chart/index.html");
    browserAPI.tabs.create({ url });
  }, []);

  return (
    <>
      {view.kind === "today" && (
        todayData
          ? <TodaySummary data={todayData} onGameSelect={handleGameSelect} />
          : error
          ? <p>{error}</p>
          : null
      )}

      {view.kind === "game" && (
        <GameDetailView
          gameType={view.gameType}
          onBack={handleBack}
          onCompare={handleCompare}
        />
      )}

      {view.kind === "compare" && (
        <ComparisonView
          gameType={view.gameType}
          friendName={view.friendName}
          onBack={handleBack}
        />
      )}

      {view.kind === "today" && (
        <footer class="popup-footer">
          <button
            class="popup-footer-link"
            type="button"
            onClick={openCompare}
            title="Compare scores with friends in a full page"
          >
            ⚔ Head to Head
          </button>
          <button
            class="popup-footer-link"
            type="button"
            onClick={openChart}
            title="View performance charts and trends over time"
          >
            📊 Games trends
          </button>
          <button
            class="popup-footer-link -popup-footer-settings"
            type="button"
            onClick={openSettings}
            title="Configure extension settings"
          >
            ⚙ Settings
          </button>
        </footer>
      )}
    </>
  );
}

render(<App />, document.getElementById("app")!);
