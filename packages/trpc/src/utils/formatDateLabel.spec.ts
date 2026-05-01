import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateLabel } from "./formatDateLabel.js";

describe("formatDateLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels an expense created late evening SGT as Today (regression: Vercel runs UTC)", () => {
    // Now: 2026-05-01 21:30 SGT == 13:30 UTC.
    vi.setSystemTime(new Date("2026-05-01T13:30:00Z"));
    // Expense.date stored as 2026-05-01 00:00 SGT == 2026-04-30 16:00 UTC.
    const expenseDate = new Date("2026-04-30T16:00:00Z");
    expect(formatDateLabel(expenseDate, "Asia/Singapore")).toBe("Today");
  });

  it("labels yesterday in SGT correctly", () => {
    vi.setSystemTime(new Date("2026-05-01T13:30:00Z")); // May 1, 21:30 SGT
    const expenseDate = new Date("2026-04-30T00:00:00+08:00"); // Apr 30 SGT
    expect(formatDateLabel(expenseDate, "Asia/Singapore")).toBe("Yesterday");
  });

  it("labels tomorrow in SGT correctly", () => {
    vi.setSystemTime(new Date("2026-05-01T13:30:00Z")); // May 1, 21:30 SGT
    const expenseDate = new Date("2026-05-02T00:00:00+08:00"); // May 2 SGT
    expect(formatDateLabel(expenseDate, "Asia/Singapore")).toBe("Tomorrow");
  });

  it("falls back to short date for older dates", () => {
    vi.setSystemTime(new Date("2026-05-01T13:30:00Z"));
    const expenseDate = new Date("2026-04-15T00:00:00+08:00"); // Apr 15 SGT
    expect(formatDateLabel(expenseDate, "Asia/Singapore")).toBe("Apr 15");
  });

  it("defaults to Asia/Singapore when timezone is null/undefined", () => {
    vi.setSystemTime(new Date("2026-05-01T13:30:00Z"));
    const expenseDate = new Date("2026-04-30T16:00:00Z"); // = May 1 SGT
    expect(formatDateLabel(expenseDate, null)).toBe("Today");
    expect(formatDateLabel(expenseDate, undefined)).toBe("Today");
    expect(formatDateLabel(expenseDate)).toBe("Today");
  });

  it("respects an explicit non-default timezone (UTC)", () => {
    vi.setSystemTime(new Date("2026-05-01T13:30:00Z")); // May 1 in UTC
    const expenseDate = new Date("2026-04-30T16:00:00Z"); // Apr 30 in UTC
    expect(formatDateLabel(expenseDate, "UTC")).toBe("Yesterday");
  });
});
