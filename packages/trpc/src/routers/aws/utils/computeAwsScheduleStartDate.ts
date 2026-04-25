import { ymdInTimezone, wallClockMidnightInTz } from "./tzDate.js";

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
