# LinkedIn Games Tracker – Agent Guidelines

## Project Overview

Chrome extension (Manifest V3) that tracks LinkedIn game performance (Pinpoint, Queens, Crossclimb,
Tango, Wend, Patches, Zip, Mini-Sudoku). Built with Deno + esbuild, outputs to `dist/`.

## Environment

- **Runtime:** Deno (located at `C:\Users\bordime001\.deno\bin\deno.exe`)
- **Shell:** PowerShell on Windows
- **Build:** `deno task build` — bundles TypeScript via esbuild into `dist/`
- **Type-check:** `deno task check`
- **Test:** `deno task test`
- **Lint:** `just lint`
- **Format:** `deno fmt`

At the start of a terminal session, run a simple `cd <folder>` command first to confirm the working
directory. Don't join the `cd` command with others commands like deno.

## Architecture

```
src/
  background/   – Service worker, data store, messaging, storage monitor
  content/      – Content scripts injected on LinkedIn game pages
  lib/          – Shared types, validators, formatters, browser API wrapper
  popup/        – Extension popup UI (HTML/CSS/TS), views for stats/sessions/export/import
manifest.json   – Extension manifest (copied to dist at build time)
build.ts        – Deno + esbuild build script
```

## Key Conventions

- TypeScript throughout; no `node_modules` — use Deno imports and `npm:` specifiers in `deno.json`.
- Tests use Deno's built-in test runner (`_test.ts` suffix). Property-based tests use `fast-check`.
- Browser APIs (chrome.storage, chrome.runtime) are wrapped in `src/lib/browser.ts` for testability.
- Content scripts scrape completed game results from LinkedIn DOM — they don't interact with the
  page beyond reading.
- The popup communicates with the background service worker via `chrome.runtime.sendMessage`.

## Validation & Testing

- Always run `deno task check` after modifying TypeScript to catch type errors.
- Run `deno lint` to catch lint issues.
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
