import { wallClockMidnightInTz } from "../routers/aws/utils/tzDate.js";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface MonthRange {
  start: Date;
  endExclusive: Date;
}

function parseYearMonth(input: string): { year: number; month: number } {
  const match = MONTH_RE.exec(input);
  if (!match) {
    throw new Error(`Invalid month: ${input}. Expected YYYY-MM.`);
  }
  return { year: Number(match[1]), month: Number(match[2]) }; // month 1-indexed
}

/**
 * Parse a `YYYY-MM` string into a UTC half-open interval `[start, endExclusive)`.
 * Throws if the input is malformed.
 */
export function parseMonthRange(input: string): MonthRange {
  const { year, month } = parseYearMonth(input);
  const monthIndex = month - 1; // JS months are 0-indexed
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const endExclusive = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { start, endExclusive };
}

/**
 * Parse a `YYYY-MM` string into a half-open interval `[start, endExclusive)`
 * whose boundaries are local midnight in `timezone`, expressed as UTC
 * instants ready to query the (UTC-stored) `Expense.date` column.
 *
 * Example: `("2026-06", "Asia/Singapore")` →
 *   start        = 2026-05-31T16:00:00.000Z  (2026-06-01T00:00 SGT)
 *   endExclusive = 2026-06-30T16:00:00.000Z  (2026-07-01T00:00 SGT)
 *
 * Throws if the input is malformed.
 */
export function parseMonthRangeInTimezone(
  input: string,
  timezone: string
): MonthRange {
  const { year, month } = parseYearMonth(input);
  // `wallClockMidnightInTz` normalizes month/day overflow via Date.UTC, so
  // month + 1 rolls December into next January correctly.
  const start = wallClockMidnightInTz(year, month, 1, timezone);
  const endExclusive = wallClockMidnightInTz(year, month + 1, 1, timezone);
  return { start, endExclusive };
}
