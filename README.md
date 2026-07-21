# Games Tracker for LinkedIn

Browser extension that automatically tracks your LinkedIn game performance and displays statistics.

Supports: **Pinpoint**, **Queens**, **Crossclimb**, **Tango**, **Wend**, **Patches**, **Zip**, and
**Mini-Sudoku**.

## How It Works

1. Content scripts run on LinkedIn pages and detect when you complete a game.
2. Results are sent to a background service worker that stores them in IndexedDB (via `idb`).
3. The popup UI shows your stats, session history, comparison views, and friend leaderboards.

## Architecture

```
src/
  background/   Service worker, IndexedDB data store, message controller
  chart/        Standalone chart page (Chart.js visualizations)
  compare/      Standalone 1v1 comparison page (all games head-to-head)
  content/      Content scripts that scrape completed game results from LinkedIn
  lib/          Shared types, validators, formatters, browser API wrapper
  popup/        Extension popup UI (Preact + JSX)
    views/      Today summary, game detail, and comparison view components
  settings/     Settings page (data export/import via CSV)
  shared/       Shared CSS
manifest.json   Chrome extension manifest (Manifest V3)
manifest.firefox.json   Firefox-specific overrides
build.ts        Deno + esbuild build script
dist/           Build output (git-ignored)
```

## Prerequisites

- [Deno](https://deno.land/) (v1.40+)
- [just](https://github.com/casey/just) command runner (optional, but recommended)

## Development

```sh
# list available recipes
just

# bundle the extension into dist/ (Chrome + Firefox)
just build

# type-check all TypeScript sources
just check

# run tests
just test

# lint sources (deno lint + oxlint)
just lint

# format sources (line width 100)
just fmt

# verify formatting without writing changes
just fmt-check

# run all quality gates (typecheck + test + format check + lint)
just ci

# remove build outputs
just clean
```

If you don't have `just` installed, you can use `deno task` directly:

```sh
deno task build
deno task build:firefox
deno task check
deno task test
```

## Loading the Extension

### Chrome

1. Run `just build` to produce the `dist/` folder.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle in the top-right).
4. Click **Load unpacked** and select the `dist/chrome` directory.
5. Navigate to a LinkedIn game page, complete a game, and open the extension popup to see your
   stats.

### Firefox

1. Run `just build` (builds both targets).
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on** and select any file in the `dist/firefox` directory.

## Permissions

The extension requests no special permissions — only content script access on `linkedin.com` pages
for scraping game results.

## Testing

Tests use Deno's built-in test runner. Test files are suffixed with `_test.ts` and live alongside
the source they test. Property-based tests use `fast-check`.

```sh
just test
```
