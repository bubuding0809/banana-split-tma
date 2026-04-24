import { describe, it, expect } from "vitest";
import { formatSnapshotDateRange } from "./date";

describe("formatSnapshotDateRange", () => {
  it("returns a single date when earliest and latest are the same day", () => {
    const d = new Date("2026-04-05T10:00:00");
    expect(formatSnapshotDateRange(d, d)).toBe("5–5 Apr 2026");
  });

  it("formats a same-month range as `D1–D2 Mon YYYY`", () => {
    const earliest = new Date("2026-04-03T00:00:00");
    const latest = new Date("2026-04-12T00:00:00");
    expect(formatSnapshotDateRange(earliest, latest)).toBe("3–12 Apr 2026");
  });

  it("formats a same-year cross-month range as `D1 Mon1 – D2 Mon2 YYYY`", () => {
    const earliest = new Date("2026-03-30T00:00:00");
    const latest = new Date("2026-04-12T00:00:00");
    expect(formatSnapshotDateRange(earliest, latest)).toBe(
      "30 Mar – 12 Apr 2026"
    );
  });

  it("formats a cross-year range as `D1 Mon1 YYYY1 – D2 Mon2 YYYY2`", () => {
    const earliest = new Date("2025-12-28T00:00:00");
    const latest = new Date("2026-01-03T00:00:00");
    expect(formatSnapshotDateRange(earliest, latest)).toBe(
      "28 Dec 2025 – 3 Jan 2026"
    );
  });
});
