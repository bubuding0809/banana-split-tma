/**
 * Timezone-aware date utilities. Stays vanilla Intl-only so the lambda
 * webhook (no date-fns-tz dep) and the trpc package can share one
 * implementation.
 */

/**
 * Year/month/day as displayed in `timezone` for the given UTC instant.
 * Month is 1-indexed to match `wallClockMidnightInTz`.
 */
export function ymdInTimezone(
  instant: Date,
  timezone: string
): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? NaN);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * UTC instant that, when displayed in `timezone`, reads as 00:00:00 on
 * (year, month, day). `month` is 1-indexed; `day` may overflow (e.g.
 * day=32 → next month) since we delegate normalization to Date.UTC.
 */
export function wallClockMidnightInTz(
  year: number,
  month: number,
  day: number,
  timezone: string
): Date {
  // Initial guess: pretend the wall clock is already UTC, then correct by
  // the timezone's offset at that instant. One iteration is enough for
  // any timezone with a fixed-or-DST offset (no historical jumps).
  const naiveUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetMs = tzOffsetAtInstantMs(naiveUtcMs, timezone);
  return new Date(naiveUtcMs - offsetMs);
}

/**
 * Convenience: UTC instant of midnight in `timezone` for whatever local
 * day the given UTC instant falls on. Used by the recurring-expense
 * webhook to materialise an Expense.date that aligns with how same-day
 * manual expenses are stored (SGT-midnight as UTC, not UTC-midnight).
 */
export function tzMidnightForInstant(instant: Date, timezone: string): Date {
  const { year, month, day } = ymdInTimezone(instant, timezone);
  return wallClockMidnightInTz(year, month, day, timezone);
}

/**
 * Offset (ms) between UTC and `timezone` at the given UTC instant.
 * Positive for east-of-UTC, negative for west.
 */
function tzOffsetAtInstantMs(utcInstantMs: number, timezone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(utcInstantMs));
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? NaN);
  // hour can come back as 24 for midnight in some locales — normalize to 0.
  const hour = get("hour") % 24;
  const reconstructed = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );
  return reconstructed - utcInstantMs;
}
