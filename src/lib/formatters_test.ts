import { assertEquals } from "@std/assert";
import { buildPercentilePills, formatTime } from "./formatters.ts";

// --- formatTime tests ---

Deno.test("formatTime - seconds only", () => {
  assertEquals(formatTime(45), "45s");
});

Deno.test("formatTime - zero seconds", () => {
  assertEquals(formatTime(0), "0s");
});

Deno.test("formatTime - minutes and seconds", () => {
  assertEquals(formatTime(154), "2m 34s");
});

Deno.test("formatTime - exact minutes", () => {
  assertEquals(formatTime(120), "2m 0s");
});

// --- buildPercentilePills tests ---

Deno.test("buildPercentilePills - both percentiles present", () => {
  const pills = buildPercentilePills(85, 60);
  assertEquals(pills.length, 2);
  assertEquals(pills[0].key, "hist");
  assertEquals(pills[0].label, "🏆 Top 85% all time");
  assertEquals(pills[0].cssClass, "pill--great");
  assertEquals(pills[1].key, "friends");
  assertEquals(pills[1].label, "👥 Top 60% friends");
  assertEquals(pills[1].cssClass, "pill--good");
});

Deno.test("buildPercentilePills - only history percentile", () => {
  const pills = buildPercentilePills(95, null);
  assertEquals(pills.length, 1);
  assertEquals(pills[0].key, "hist");
  assertEquals(pills[0].cssClass, "pill--excellent");
});

Deno.test("buildPercentilePills - both null returns empty", () => {
  const pills = buildPercentilePills(null, null);
  assertEquals(pills.length, 0);
});
