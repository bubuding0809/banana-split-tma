import { describe, it, expect } from "vitest";
import { parseMonthRange, parseMonthRangeInTimezone } from "./monthRange.js";

describe("parseMonthRange", () => {
  it("returns UTC start and exclusive end for a mid-year month", () => {
    const { start, endExclusive } = parseMonthRange("2026-04");
    expect(start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("rolls over December to next January", () => {
    const { endExclusive } = parseMonthRange("2026-12");
    expect(endExclusive.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("handles leap-year February", () => {
    const { start, endExclusive } = parseMonthRange("2028-02");
    expect(start.toISOString()).toBe("2028-02-01T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });

  it("throws on malformed input", () => {
    expect(() => parseMonthRange("2026-13")).toThrow();
    expect(() => parseMonthRange("26-04")).toThrow();
    expect(() => parseMonthRange("2026/04")).toThrow();
  });
});

describe("parseMonthRangeInTimezone", () => {
  it("converts SGT (UTC+8) local month boundaries back to UTC", () => {
    // 2026-06-01T00:00 SGT === 2026-05-31T16:00 UTC
    const { start, endExclusive } = parseMonthRangeInTimezone(
      "2026-06",
      "Asia/Singapore"
    );
    expect(start.toISOString()).toBe("2026-05-31T16:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-06-30T16:00:00.000Z");
  });

  it("honours a west-of-UTC timezone with DST (America/New_York, EDT in June)", () => {
    // EDT is UTC-4 in June; local midnight June 1 === 2026-06-01T04:00 UTC
    const { start, endExclusive } = parseMonthRangeInTimezone(
      "2026-06",
      "America/New_York"
    );
    expect(start.toISOString()).toBe("2026-06-01T04:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-07-01T04:00:00.000Z");
  });

  it("gives independent, correct boundaries for a month straddling a DST transition", () => {
    // US DST ends 2026-11-01 at 02:00 local. Nov 1 midnight is still EDT
    // (UTC-4); Dec 1 midnight is EST (UTC-5). Each boundary resolves on its
    // own offset, so the window is intentionally asymmetric.
    const { start, endExclusive } = parseMonthRangeInTimezone(
      "2026-11",
      "America/New_York"
    );
    expect(start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });

  it("rolls over December to next January in local time", () => {
    // 2027-01-01T00:00 SGT === 2026-12-31T16:00 UTC
    const { endExclusive } = parseMonthRangeInTimezone(
      "2026-12",
      "Asia/Singapore"
    );
    expect(endExclusive.toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });

  it("matches UTC boundaries when timezone is UTC", () => {
    const { start, endExclusive } = parseMonthRangeInTimezone("2026-04", "UTC");
    expect(start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("throws on malformed input", () => {
    expect(() =>
      parseMonthRangeInTimezone("2026-13", "Asia/Singapore")
    ).toThrow();
    expect(() =>
      parseMonthRangeInTimezone("26-04", "Asia/Singapore")
    ).toThrow();
  });
});
