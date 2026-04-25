import { describe, it, expect } from "vitest";
import { computeAwsScheduleStartDate } from "./computeAwsScheduleStartDate.js";

// Helper for clearer assertions — formats a Date as a UTC ISO string
// truncated to the minute, since AWS only honors minute precision via cron.
const toUtcMinute = (d: Date) => d.toISOString().slice(0, 16) + "Z";

describe("computeAwsScheduleStartDate", () => {
  // The bug this helper exists to fix: passing the user's transaction date
  // verbatim to AWS Scheduler triggers
  //   "ValidationException: The StartDate you specify cannot be earlier than 5 minutes ago"
  // for any same-day or backfilled expense. The helper must produce a Date
  // that's both (a) safely in the future relative to `now`, and (b) past
  // the original transaction day boundary in the chat's timezone, so the
  // first cron fire never duplicates the manually-created original.

  describe("Asia/Singapore (UTC+8, no DST)", () => {
    const SGT = "Asia/Singapore";

    it("transaction today, evening: returns tomorrow 00:00 SGT (= 16:00Z prev day)", () => {
      const now = new Date("2026-04-25T12:57:00Z"); // 20:57 SGT
      const transactionDate = new Date("2026-04-25T12:00:00Z");
      const result = computeAwsScheduleStartDate({
        transactionDate,
        now,
        timezone: SGT,
      });
      // Tomorrow midnight SGT (Apr 26 00:00 +08) = Apr 25 16:00Z
      expect(toUtcMinute(result)).toBe("2026-04-25T16:00Z");
    });

    it("transaction today, just before midnight SGT: still returns tomorrow 00:00 SGT", () => {
      const now = new Date("2026-04-25T15:30:00Z"); // 23:30 SGT
      const transactionDate = new Date("2026-04-25T15:00:00Z");
      const result = computeAwsScheduleStartDate({
        transactionDate,
        now,
        timezone: SGT,
      });
      expect(toUtcMinute(result)).toBe("2026-04-25T16:00Z");
    });

    it("backfilled past date: nextDayBoundary is in the past, falls back to now+buffer", () => {
      const now = new Date("2026-04-25T12:00:00Z");
      const transactionDate = new Date("2026-01-01T00:00:00Z"); // months ago
      const result = computeAwsScheduleStartDate({
        transactionDate,
        now,
        timezone: SGT,
      });
      // now + 60s = 12:01:00Z
      expect(toUtcMinute(result)).toBe("2026-04-25T12:01Z");
    });
  });

  describe("America/New_York (DST-aware)", () => {
    const NY = "America/New_York";

    it("EDT (April, UTC-4): tomorrow 00:00 EDT = 04:00Z", () => {
      const now = new Date("2026-04-25T12:00:00Z"); // 08:00 EDT
      const transactionDate = new Date("2026-04-25T12:00:00Z");
      const result = computeAwsScheduleStartDate({
        transactionDate,
        now,
        timezone: NY,
      });
      // Tomorrow midnight NY (Apr 26 00:00 EDT) = Apr 26 04:00Z
      expect(toUtcMinute(result)).toBe("2026-04-26T04:00Z");
    });

    it("EST (January, UTC-5): tomorrow 00:00 EST = 05:00Z", () => {
      const now = new Date("2026-01-15T12:00:00Z");
      const transactionDate = new Date("2026-01-15T12:00:00Z");
      const result = computeAwsScheduleStartDate({
        transactionDate,
        now,
        timezone: NY,
      });
      expect(toUtcMinute(result)).toBe("2026-01-16T05:00Z");
    });
  });

  describe("UTC", () => {
    it("transaction today: tomorrow 00:00Z", () => {
      const now = new Date("2026-04-25T12:00:00Z");
      const transactionDate = new Date("2026-04-25T12:00:00Z");
      const result = computeAwsScheduleStartDate({
        transactionDate,
        now,
        timezone: "UTC",
      });
      expect(toUtcMinute(result)).toBe("2026-04-26T00:00Z");
    });
  });

  describe("custom buffer", () => {
    it("fireBufferSec=300 produces now + 5min when nextDayBoundary is in the past", () => {
      const now = new Date("2026-04-25T12:00:00Z");
      const transactionDate = new Date("2026-01-01T00:00:00Z");
      const result = computeAwsScheduleStartDate({
        transactionDate,
        now,
        timezone: "Asia/Singapore",
        fireBufferSec: 300,
      });
      expect(toUtcMinute(result)).toBe("2026-04-25T12:05Z");
    });
  });

  describe("AWS 5-minute rule guarantee", () => {
    it("never returns a Date older than now (regardless of inputs)", () => {
      const now = new Date("2026-04-25T12:00:00Z");
      // Try a wide spread of past transactionDates and timezones.
      const cases: { txn: string; tz: string }[] = [
        { txn: "2020-01-01T00:00:00Z", tz: "Asia/Singapore" },
        { txn: "2025-12-31T23:59:00Z", tz: "America/New_York" },
        { txn: "2026-04-25T11:00:00Z", tz: "Europe/London" },
        { txn: "2026-04-25T00:00:00Z", tz: "UTC" },
      ];
      for (const c of cases) {
        const result = computeAwsScheduleStartDate({
          transactionDate: new Date(c.txn),
          now,
          timezone: c.tz,
        });
        expect(result.getTime()).toBeGreaterThanOrEqual(now.getTime());
      }
    });
  });
});
