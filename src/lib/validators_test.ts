import { assertEquals } from "@std/assert";
import {
  isValidCompletionTime,
  isValidDate,
  isValidGameType,
  isValidGuesses,
  isValidScore,
  validateGameSession,
} from "./validators.ts";

// --- isValidGameType ---

Deno.test("isValidGameType - accepts all valid game types", () => {
  const validTypes = [
    "pinpoint",
    "queens",
    "crossclimb",
    "tango",
    "wend",
    "patches",
    "zip",
    "sudoku",
  ];
  for (const type of validTypes) {
    assertEquals(isValidGameType(type), true, `Expected "${type}" to be valid`);
  }
});

Deno.test("isValidGameType - rejects invalid strings", () => {
  assertEquals(isValidGameType(""), false);
  assertEquals(isValidGameType("wordle"), false);
  assertEquals(isValidGameType("Pinpoint"), false);
  assertEquals(isValidGameType("QUEENS"), false);
});

// --- isValidDate ---

Deno.test("isValidDate - accepts valid ISO dates", () => {
  assertEquals(isValidDate("2024-01-15"), true);
  assertEquals(isValidDate("2024-02-29"), true); // 2024 is a leap year
  assertEquals(isValidDate("2000-12-31"), true);
});

Deno.test("isValidDate - rejects invalid date formats", () => {
  assertEquals(isValidDate("2024/01/15"), false);
  assertEquals(isValidDate("15-01-2024"), false);
  assertEquals(isValidDate("2024-1-15"), false);
  assertEquals(isValidDate("not-a-date"), false);
  assertEquals(isValidDate(""), false);
});

Deno.test("isValidDate - rejects invalid calendar dates", () => {
  assertEquals(isValidDate("2023-02-29"), false); // not a leap year
  assertEquals(isValidDate("2024-13-01"), false); // month 13
  assertEquals(isValidDate("2024-00-01"), false); // month 0
  assertEquals(isValidDate("2024-01-32"), false); // day 32
  assertEquals(isValidDate("2024-04-31"), false); // April has 30 days
});

// --- isValidGuesses ---

Deno.test("isValidGuesses - accepts 1 through 6", () => {
  for (let i = 1; i <= 6; i++) {
    assertEquals(isValidGuesses(i), true, `Expected ${i} to be valid`);
  }
});

Deno.test("isValidGuesses - rejects out of range values", () => {
  assertEquals(isValidGuesses(0), false);
  assertEquals(isValidGuesses(7), false);
  assertEquals(isValidGuesses(-1), false);
});

Deno.test("isValidGuesses - rejects non-integers", () => {
  assertEquals(isValidGuesses(2.5), false);
  assertEquals(isValidGuesses(1.1), false);
  assertEquals(isValidGuesses(NaN), false);
  assertEquals(isValidGuesses(Infinity), false);
});

// --- isValidScore ---

Deno.test("isValidScore - valid for pinpoint with 1-6", () => {
  assertEquals(isValidScore("pinpoint", 3), true);
  assertEquals(isValidScore("pinpoint", 1), true);
  assertEquals(isValidScore("pinpoint", 6), true);
});

Deno.test("isValidScore - invalid for pinpoint with out of range", () => {
  assertEquals(isValidScore("pinpoint", 0), false);
  assertEquals(isValidScore("pinpoint", 7), false);
});

Deno.test("isValidScore - returns false for time-based games", () => {
  assertEquals(isValidScore("queens", 3), false);
  assertEquals(isValidScore("crossclimb", 1), false);
  assertEquals(isValidScore("tango", 5), false);
});

// --- isValidCompletionTime ---

Deno.test("isValidCompletionTime - accepts positive numbers", () => {
  assertEquals(isValidCompletionTime(1), true);
  assertEquals(isValidCompletionTime(0.5), true);
  assertEquals(isValidCompletionTime(999), true);
});

Deno.test("isValidCompletionTime - rejects zero and negative", () => {
  assertEquals(isValidCompletionTime(0), false);
  assertEquals(isValidCompletionTime(-1), false);
  assertEquals(isValidCompletionTime(-100), false);
});

Deno.test("isValidCompletionTime - rejects non-finite", () => {
  assertEquals(isValidCompletionTime(NaN), false);
  assertEquals(isValidCompletionTime(Infinity), false);
  assertEquals(isValidCompletionTime(-Infinity), false);
});

// --- validateGameSession ---

Deno.test("validateGameSession - valid Pinpoint session", () => {
  const result = validateGameSession({
    gameType: "pinpoint",
    date: "2024-01-15",
    playerName: "self",
    completed: true,
    scrapedAt: "2024-01-15T10:00:00Z",
    score: 3,
  });
  assertEquals(result.valid, true);
  assertEquals(result.errors, []);
  assertEquals(result.narrowed?.gameType, "pinpoint");
  if (result.narrowed && result.narrowed.gameType === "pinpoint") {
    assertEquals(result.narrowed.score, 3);
  }
});

Deno.test("validateGameSession - valid time-based session (Queens)", () => {
  const result = validateGameSession({
    gameType: "queens",
    date: "2024-01-15",
    playerName: "self",
    completed: true,
    scrapedAt: "2024-01-15T10:00:00Z",
    completionTime: 94,
  });
  assertEquals(result.valid, true);
  assertEquals(result.errors, []);
  assertEquals(result.narrowed?.gameType, "queens");
  if (result.narrowed && result.narrowed.gameType !== "pinpoint") {
    assertEquals(result.narrowed.completionTime, 94);
  }
});

Deno.test("validateGameSession - rejects null input", () => {
  const result = validateGameSession(null);
  assertEquals(result.valid, false);
  assertEquals(result.narrowed, null);
});

Deno.test("validateGameSession - rejects non-object input", () => {
  const result = validateGameSession("not an object");
  assertEquals(result.valid, false);
});

Deno.test("validateGameSession - rejects invalid gameType", () => {
  const result = validateGameSession({
    gameType: "wordle",
    date: "2024-01-15",
    playerName: "self",
    completed: true,
    scrapedAt: "2024-01-15T10:00:00Z",
    score: 3,
  });
  assertEquals(result.valid, false);
  assertEquals(result.errors.length > 0, true);
});

Deno.test("validateGameSession - rejects Pinpoint with completionTime present", () => {
  const result = validateGameSession({
    gameType: "pinpoint",
    date: "2024-01-15",
    playerName: "self",
    completed: true,
    scrapedAt: "2024-01-15T10:00:00Z",
    score: 3,
    completionTime: 50,
  });
  assertEquals(result.valid, false);
  assertEquals(result.errors.some((e) => e.includes("completionTime")), true);
});

Deno.test("validateGameSession - rejects time-based with score present", () => {
  const result = validateGameSession({
    gameType: "queens",
    date: "2024-01-15",
    playerName: "self",
    completed: true,
    scrapedAt: "2024-01-15T10:00:00Z",
    completionTime: 94,
    score: 3,
  });
  assertEquals(result.valid, false);
  assertEquals(result.errors.some((e) => e.includes("score")), true);
});

Deno.test("validateGameSession - rejects Pinpoint with invalid score", () => {
  const result = validateGameSession({
    gameType: "pinpoint",
    date: "2024-01-15",
    playerName: "self",
    completed: true,
    scrapedAt: "2024-01-15T10:00:00Z",
    score: 7,
  });
  assertEquals(result.valid, false);
  assertEquals(result.errors.some((e) => e.includes("score")), true);
});

Deno.test("validateGameSession - rejects time-based with invalid completionTime", () => {
  const result = validateGameSession({
    gameType: "tango",
    date: "2024-01-15",
    playerName: "self",
    completed: true,
    scrapedAt: "2024-01-15T10:00:00Z",
    completionTime: 0,
  });
  assertEquals(result.valid, false);
  assertEquals(result.errors.some((e) => e.includes("completionTime")), true);
});

Deno.test("validateGameSession - rejects missing required fields", () => {
  const result = validateGameSession({
    gameType: "pinpoint",
    score: 3,
  });
  assertEquals(result.valid, false);
  assertEquals(result.errors.length >= 3, true); // date, playerName, completed, scrapedAt
});
