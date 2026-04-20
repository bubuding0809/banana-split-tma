import { describe, it, expect } from "vitest";
import { parseMonthRange } from "./monthRange.js";

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
