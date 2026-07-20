/**
 * Settings Page Entry Point
 *
 * Renders the settings UI with data export/import functionality.
 */

import { render } from "preact";
import { useCallback, useRef, useState } from "preact/hooks";
import { browserAPI } from "../lib/browser.ts";
import type { GameSession } from "../lib/types.ts";
import { MessageType } from "../lib/types.ts";
import { validateGameSession } from "../lib/validators.ts";

/** CSV column headers in canonical order */
const CSV_HEADERS = [
  "gameType",
  "date",
  "playerName",
  "completed",
  "scrapedAt",
  "score",
  "completionTime",
] as const;

/** Escape a value for CSV (wrap in quotes if it contains commas, quotes, or newlines) */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Convert sessions to a CSV string */
function sessionsToCSV(sessions: GameSession[]): string {
  const rows = [CSV_HEADERS.join(",")];
  for (const s of sessions) {
    const row = [
      s.gameType,
      s.date,
      csvEscape(s.playerName),
      String(s.completed),
      s.scrapedAt,
      s.gameType === "pinpoint" ? String(s.score) : "",
      s.gameType !== "pinpoint" ? String(s.completionTime) : "",
    ];
    rows.push(row.join(","));
  }
  return rows.join("\n");
}

/** Parse a CSV string into an array of raw row objects */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

/** Parse a single CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/** Convert a raw CSV row to a GameSession-shaped object for validation */
function rowToSession(row: Record<string, string>): unknown {
  const obj: Record<string, unknown> = {
    gameType: row.gameType?.trim(),
    date: row.date?.trim(),
    playerName: row.playerName?.trim(),
    completed: row.completed?.trim().toLowerCase() === "true",
    scrapedAt: row.scrapedAt?.trim(),
  };

  const score = row.score?.trim();
  if (score !== "" && score !== undefined) {
    obj.score = Number(score);
  }

  const completionTime = row.completionTime?.trim();
  if (completionTime !== "" && completionTime !== undefined) {
    obj.completionTime = Number(completionTime);
  }

  return obj;
}

type ImportStatus =
  | { state: "idle" }
  | { state: "processing" }
  | { state: "success"; imported: number; skipped: number; overwritten: number }
  | { state: "error"; message: string };

function Settings() {
  const [exportStatus, setExportStatus] = useState<string>("");
  const [importStatus, setImportStatus] = useState<ImportStatus>({ state: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onBack = useCallback(() => {
    const url = browserAPI.runtime.getURL("popup/index.html");
    globalThis.location.assign(url);
  }, []);

  const onExport = useCallback(async () => {
    setExportStatus("Exporting…");
    try {
      const sessions = (await browserAPI.runtime.sendMessage({
        type: MessageType.GET_ALL_SESSIONS,
      })) as GameSession[];

      if (!sessions || sessions.length === 0) {
        setExportStatus("No data to export.");
        return;
      }

      const csv = sessionsToCSV(sessions);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `game-tracker-export-${Temporal.Now.plainDateISO().toString()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus(`Exported ${sessions.length} sessions.`);
    } catch (err) {
      setExportStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const onImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback(async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setImportStatus({ state: "processing" });

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        setImportStatus({ state: "error", message: "CSV file is empty or has no data rows." });
        return;
      }

      // Validate all rows
      const validSessions: GameSession[] = [];
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const raw = rowToSession(rows[i]);
        const result = validateGameSession(raw);
        if (result.valid && result.narrowed) {
          validSessions.push(result.narrowed);
        } else {
          errors.push(`Row ${i + 2}: ${result.errors.join("; ")}`);
        }
      }

      if (validSessions.length === 0) {
        const errorSample = errors.slice(0, 3).join("\n");
        setImportStatus({
          state: "error",
          message: `No valid sessions found.\n${errorSample}`,
        });
        return;
      }

      // Send to background for upsert
      const results = (await browserAPI.runtime.sendMessage({
        type: MessageType.IMPORT_SESSIONS,
        payload: validSessions,
      })) as { success: boolean; overwritten: boolean }[];

      const imported = results.filter((r) => r.success && !r.overwritten).length;
      const overwritten = results.filter((r) => r.success && r.overwritten).length;
      const skipped = errors.length;

      setImportStatus({ state: "success", imported, skipped, overwritten });
    } catch (err) {
      setImportStatus({
        state: "error",
        message: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Reset file input so the same file can be re-selected
    input.value = "";
  }, []);

  return (
    <>
      <button type="button" class="back-btn" onClick={onBack}>← Back</button>
      <h1 class="settings-title">Settings</h1>

      <div class="card settings-card">
        <h2 class="settings-card-title">Export Data</h2>
        <p class="settings-card-description">
          Download all your game sessions as a CSV file. Use this to back up your data or transfer
          it to another device.
        </p>
        <button type="button" class="settings-btn" onClick={onExport}>
          Export CSV
        </button>
        {exportStatus && <p class="settings-status">{exportStatus}</p>}
      </div>

      <div class="card settings-card">
        <h2 class="settings-card-title">Import Data</h2>
        <p class="settings-card-description">
          Import game sessions from a CSV file. Existing records with the same game, date, and
          player will be updated if the values differ.
        </p>
        <button type="button" class="settings-btn" onClick={onImportClick}>
          Import CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          class="settings-file-input"
          onChange={onFileSelected}
          aria-label="Select CSV file to import"
        />
        {importStatus.state === "processing" && <p class="settings-status">Processing…</p>}
        {importStatus.state === "success" && (
          <p class="settings-status settings-status--success">
            Done — {importStatus.imported} new, {importStatus.overwritten} updated
            {importStatus.skipped > 0 && `, ${importStatus.skipped} skipped (invalid)`}
          </p>
        )}
        {importStatus.state === "error" && (
          <p class="settings-status settings-status--error">{importStatus.message}</p>
        )}
      </div>
    </>
  );
}

render(<Settings />, document.getElementById("app")!);
