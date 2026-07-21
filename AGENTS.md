# LinkedIn Games Tracker – Agent Guidelines

## Project Overview

Chrome/Firefox extension (Manifest V3) that tracks LinkedIn game performance (Pinpoint, Queens,
Crossclimb, Tango, Wend, Patches, Zip, Mini-Sudoku). Built with Deno + esbuild, outputs to `dist/`.

## Environment

- **Runtime:** Deno (located at `C:\Users\bordime001\.deno\bin\deno.exe`)
- **Shell:** PowerShell on Windows
- **Build:** `deno task build` — bundles TypeScript via esbuild into `dist/` (Chrome target)
- **Build (Firefox):** `deno task build:firefox` — bundles for Firefox
- **Type-check:** `deno task check`
- **Test:** `deno task test`
- **Lint:** `just lint` — runs both `deno lint` and oxlint (via `deno run xlint`)
- **Format:** `deno fmt`
- **CI gate:** `just ci` — runs check, test, fmt-check, and lint together

## Architecture

```
src/
  background/   – Service worker, IndexedDB data store (via idb), message controller
  chart/        – Standalone chart page (Chart.js visualizations)
  compare/      – Standalone 1v1 comparison page (all games head-to-head)
  content/      – Content scripts injected on LinkedIn game pages
  lib/          – Shared types, validators, formatters, browser API wrapper
  popup/        – Extension popup UI (Preact + JSX)
    views/      – today-view, game-detail-view, comparison-view
  settings/     – Settings page (CSV export/import)
  shared/       – Shared CSS
manifest.json           – Chrome manifest (copied to dist at build time)
manifest.firefox.json   – Firefox-specific overrides (merged at build time)
build.ts                – Deno + esbuild build script
```

## Key Conventions

- TypeScript throughout; no `node_modules` — use Deno imports and `npm:` specifiers in `deno.json`.
- UI uses **Preact** with JSX (`jsxImportSource: "preact"` in compiler options).
- Persistence uses **IndexedDB** via the `idb` package.
- Tests use Deno's built-in test runner (`_test.ts` suffix). Property-based tests use `fast-check`.
- Browser APIs (chrome.runtime) are wrapped in `src/lib/browser.ts` for testability.
- Content scripts scrape completed game results from LinkedIn DOM — they don't interact with the
  page beyond reading.
- The popup communicates with the background service worker via `chrome.runtime.sendMessage`.
- Standalone pages (chart, compare, settings) also use messaging to fetch data from the background.

## Validation & Testing

- At the start of a new terminal session, check the folder and `cd` if needed.
- Always run `deno task check` after modifying TypeScript to catch type errors.
- Run `just lint` to catch lint issues (runs both deno lint and oxlint).
- Run `deno fmt` to format code.
- Run `deno task test` to verify existing tests still pass.
- Run `deno task build` to confirm the extension bundles cleanly.

## Playwright / Manual Verification

- Use Playwright MCP to verify scraping logic against live LinkedIn game pages when working on
  content scripts.
- **Stop and warn the user if Playwright is not responding or cannot connect.**
- Do not blindly assume DOM structure — inspect the actual page first.

## Things to Avoid

- Do not add Node.js dependencies or `package.json`. This is a Deno project.
- Do not modify `dist/` directly — it is a build output.
