import { assertEquals } from "@std/assert";
import { formatDistance, formatPercentile } from "./formatters.ts";

// --- formatDistance tests ---

Deno.test("formatDistance - better than average for pinpoint (lower guesses)", () => {
  const result = formatDistance(2, 3.5, "pinpoint");
  assertEquals(result, { text: "\u22121.5", color: "green" });
});

Deno.test("formatDistance - worse than average for pinpoint (higher guesses)", () => {
  const result = formatDistance(4, 2.8, "pinpoint");
  assertEquals(result, { text: "+1.2", color: "red" });
});

Deno.test("formatDistance - equal to average for pinpoint", () => {
  const result = formatDistance(3, 3, "pinpoint");
  assertEquals(result, { text: "0.0", color: "neutral" });
});

Deno.test("formatDistance - better than average for time-based game (lower time)", () => {
  const result = formatDistance(45, 57, "queens");
  assertEquals(result, { text: "\u221212.0s", color: "green" });
});

Deno.test("formatDistance - worse than average for time-based game (higher time)", () => {
  const result = formatDistance(68, 60, "crossclimb");
  assertEquals(result, { text: "+8.0s", color: "red" });
});

Deno.test("formatDistance - equal to average for time-based game", () => {
  const result = formatDistance(30, 30, "tango");
  assertEquals(result, { text: "0.0", color: "neutral" });
});

Deno.test("formatDistance - rounds to one decimal place", () => {
  const result = formatDistance(2, 2.567, "pinpoint");
  assertEquals(result, { text: "\u22120.6", color: "green" });
});

Deno.test("formatDistance - time-based appends 's' suffix", () => {
  const result = formatDistance(100, 88.3, "sudoku");
  assertEquals(result, { text: "+11.7s", color: "red" });
});

Deno.test("formatDistance - small fractional difference for pinpoint", () => {
  const result = formatDistance(3.2, 3.7, "pinpoint");
  assertEquals(result, { text: "\u22120.5", color: "green" });
});

// --- formatPercentile tests ---

Deno.test("formatPercentile - formats zero", () => {
  assertEquals(formatPercentile(0), "0%");
});

Deno.test("formatPercentile - formats 100", () => {
  assertEquals(formatPercentile(100), "100%");
});

Deno.test("formatPercentile - formats mid-range value", () => {
  assertEquals(formatPercentile(42), "42%");
});

Deno.test("formatPercentile - formats 75", () => {
  assertEquals(formatPercentile(75), "75%");
});
