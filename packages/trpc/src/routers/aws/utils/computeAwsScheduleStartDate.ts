/**
 * Computes the StartDate to send to AWS EventBridge Scheduler when creating
 * a recurring expense schedule.
 *
 * Why this helper exists:
 * - The user-supplied transaction date can be today (older than 5 minutes)
 *   or backfilled days/weeks ago. AWS rejects any StartDate older than 5
 *   minutes ago with a ValidationException.
 * - We also need to make sure the cron's first fire doesn't duplicate the
 *   manually-created original expense. The original lives on the
 *   transaction date; the schedule must start firing strictly AFTER that
 *   day's boundary in the chat's timezone.
 *
 * Algorithm:
 * 1. Compute the next-day midnight boundary in the chat's timezone. This
 *    is the earliest moment where the cron can fire without overlapping
 *    the original expense's day.
 * 2. Clamp `now` forward by `fireBufferSec` (default 60s) to satisfy AWS's
 *    "≥ now − 5min" rule with margin.
 * 3. Return whichever is later — the next-day boundary if the user is
 *    creating a same-day expense, the clamped now if the transaction was
 *    backfilled to a past date.
 */

interface ComputeArgs {
  transactionDate: Date;
  now: Date;
  timezone: string;
  /**
   * Buffer (seconds) added to `now` before comparing against the next-day
   * boundary. Default 60s — well under AWS's 300s rule, comfortably above
   * clock-skew concerns.
   */
  fireBufferSec?: number;
}

export function computeAwsScheduleStartDate(args: ComputeArgs): Date {
  const { transactionDate, now, timezone, fireBufferSec = 60 } = args;

  const { year, month, day } = ymdInTimezone(transactionDate, timezone);
  const nextDayBoundary = wallClockMidnightInTz(year, month, day + 1, timezone);
  const clampedNow = new Date(now.getTime() + fireBufferSec * 1000);

  return nextDayBoundary.getTime() >= clampedNow.getTime()
    ? nextDayBoundary
    : clampedNow;
}

// Extracts year/month/day as displayed in the target timezone for the given
// instant. Month is 1-indexed to match `wallClockMidnightInTz` below.
function ymdInTimezone(
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

// Returns the UTC instant that, when displayed in `timezone`, reads as
// 00:00:00 on (year, month, day). `month` is 1-indexed; `day` may overflow
// (e.g. day=32 → next month) since we delegate normalization to Date.UTC.
function wallClockMidnightInTz(
  year: number,
  month: number,
  day: number,
  timezone: string
): Date {
  // Initial guess: pretend the wall clock is already UTC, then correct by
  // the timezone's offset at that instant. One iteration is enough for any
  // timezone with a fixed-or-DST offset (no historical jumps).
  const naiveUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetMs = tzOffsetAtInstantMs(naiveUtcMs, timezone);
  return new Date(naiveUtcMs - offsetMs);
}

// Offset (ms) between UTC and `timezone` at the given UTC instant. Positive
// for east-of-UTC, negative for west. Uses Intl to round-trip the wall
// clock and diff back to a UTC instant.
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
