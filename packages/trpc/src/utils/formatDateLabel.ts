import { ymdInTimezone } from "../routers/aws/utils/tzDate.js";

const DEFAULT_TIMEZONE = "Asia/Singapore";

/**
 * Human-friendly date label — "Today" / "Yesterday" / "Tomorrow" for
 * near dates, short ISO-ish date otherwise. Compares the date and "now"
 * in the supplied timezone (or Asia/Singapore by default) so a chat
 * whose users live in SGT does not see "Yesterday" labels for expenses
 * they just created at 9 PM.
 *
 * The fallback to Asia/Singapore mirrors the default used by
 * `createGroupReminderScheduleHandler` and `createChat`'s schedule
 * seeding, so chats without an explicit timezone behave consistently
 * across notifications and reminders.
 */
export function formatDateLabel(
  date: Date,
  timezone: string | null | undefined = DEFAULT_TIMEZONE
): string {
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const target = ymdInTimezone(date, tz);
  const now = new Date();
  const today = ymdInTimezone(now, tz);

  // Use Date.UTC to safely calculate day differences without DST jitter
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const diffDays = Math.round((targetUtc - todayUtc) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
  }).format(date);
}
