const { test } = require('node:test');
const assert = require('node:assert');

function ymdInTimezone(instant, timezone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? NaN);
  return { year: get("year"), month: get("month"), day: get("day") };
}

const DEFAULT_TIMEZONE = "Asia/Singapore";

function formatDateLabelOld(date, timezone = DEFAULT_TIMEZONE, now) {
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const target = ymdInTimezone(date, tz);
  const today = ymdInTimezone(now, tz);
  const yesterday = ymdInTimezone(new Date(now.getTime() - 86_400_000), tz);
  const tomorrow = ymdInTimezone(new Date(now.getTime() + 86_400_000), tz);

  const same = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day;

  if (same(target, today)) return "Today";
  if (same(target, yesterday)) return "Yesterday";
  if (same(target, tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(date);
}

function formatDateLabelNew(date, timezone = DEFAULT_TIMEZONE, now) {
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const target = ymdInTimezone(date, tz);
  const today = ymdInTimezone(now, tz);

  const targetUtc = Date.UTC(target.year, target.month - 1, target.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const diffDays = Math.round((targetUtc - todayUtc) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(date);
}

test('regression: Vercel runs UTC', () => {
  const now = new Date("2026-05-01T13:30:00Z");
  const expenseDate = new Date("2026-04-30T16:00:00Z");
  assert.strictEqual(formatDateLabelNew(expenseDate, "Asia/Singapore", now), "Today");
  assert.strictEqual(formatDateLabelOld(expenseDate, "Asia/Singapore", now), "Today");
});

test('yesterday SGT', () => {
  const now = new Date("2026-05-01T13:30:00Z");
  const expenseDate = new Date("2026-04-30T00:00:00+08:00");
  assert.strictEqual(formatDateLabelNew(expenseDate, "Asia/Singapore", now), "Yesterday");
  assert.strictEqual(formatDateLabelOld(expenseDate, "Asia/Singapore", now), "Yesterday");
});

test('tomorrow SGT', () => {
  const now = new Date("2026-05-01T13:30:00Z");
  const expenseDate = new Date("2026-05-02T00:00:00+08:00");
  assert.strictEqual(formatDateLabelNew(expenseDate, "Asia/Singapore", now), "Tomorrow");
  assert.strictEqual(formatDateLabelOld(expenseDate, "Asia/Singapore", now), "Tomorrow");
});

test('older dates SGT', () => {
  const now = new Date("2026-05-01T13:30:00Z");
  const expenseDate = new Date("2026-04-15T00:00:00+08:00");
  assert.strictEqual(formatDateLabelNew(expenseDate, "Asia/Singapore", now), "Apr 15");
  assert.strictEqual(formatDateLabelOld(expenseDate, "Asia/Singapore", now), "Apr 15");
});

test('explicit non-default timezone (UTC)', () => {
  const now = new Date("2026-05-01T13:30:00Z"); // May 1 in UTC
  const expenseDate = new Date("2026-04-30T16:00:00Z"); // Apr 30 in UTC
  assert.strictEqual(formatDateLabelNew(expenseDate, "UTC", now), "Yesterday");
  assert.strictEqual(formatDateLabelOld(expenseDate, "UTC", now), "Yesterday");
});
