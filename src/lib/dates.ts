/**
 * Shared date helpers anchored to the LinkedIn games time zone.
 *
 * LinkedIn games are released daily at midnight Pacific Time.
 * https://www.linkedin.com/help/linkedin/answer/a6863543
 *
 * All "today"/"yesterday" calculations across the extension (content scripts,
 * background, popup, and standalone pages) must anchor to America/Los_Angeles
 * so that users in other time zones get the correct puzzle date regardless of
 * their local clock.
 */

/** IANA time zone that LinkedIn games are released against. */
export const LINKEDIN_GAMES_TIMEZONE = "America/Los_Angeles";

/** Returns the current puzzle date as a Temporal.PlainDate, anchored to Pacific Time. */
export function getLinkedInToday(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(LINKEDIN_GAMES_TIMEZONE);
}

/** Returns today's date in ISO format (YYYY-MM-DD), anchored to Pacific Time. */
export function getTodayISO(): string {
  return getLinkedInToday().toString();
}

/** Returns yesterday's date in ISO format (YYYY-MM-DD), anchored to Pacific Time. */
export function getYesterdayISO(): string {
  return getLinkedInToday().subtract({ days: 1 }).toString();
}
