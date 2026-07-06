# Games Tracker for LinkedIn

Browser extension that automatically tracks your LinkedIn game performance and displays statistics.

Supports: **Pinpoint**, **Queens**, **Crossclimb**, **Tango**, **Wend**, **Patches**, **Zip**, and **Mini-Sudoku**.

## How It Works

1. Content scripts run on LinkedIn pages and detect when you complete a game.
2. Results are sent to a background service worker that stores them in extension's storage.
3. The popup UI shows your stats, session history, and comparison views.

## Architecture

```
src/
  background/   Service worker, data store, messaging, storage monitor
  content/      Content scripts that scrape completed game results from LinkedIn
  lib/          Shared types, validators, formatters, browser API wrapper
  popup/        Extension popup UI (vanilla HTML/CSS/TS)
manifest.json   Chrome extension manifest (Manifest V3)
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

# bundle the extension into dist/
just build

# type-check all TypeScript sources
just check

# run tests
just test

# format sources (line width 100)
just fmt

# verify formatting without writing changes
just fmt-check

# run all quality gates (typecheck + test + format check)
just ci

# remove build outputs
just clean
```

If you don't have `just` installed, you can use `deno task` directly:

```sh
deno task build
deno task check
deno task test
```

## Loading the Extension

1. Run `just build` to produce the `dist/` folder.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle in the top-right).
4. Click **Load unpacked** and select the `dist/` directory.
5. Navigate to a LinkedIn game page, complete a game, and open the extension popup to see your stats.

## Permissions

The extension requests only the `storage` permission — no network access, no host permissions beyond LinkedIn content script matching.

## Testing

Tests use Deno's built-in test runner. Test files are suffixed with `_test.ts` and live alongside the source they test.

```sh
just test
```
