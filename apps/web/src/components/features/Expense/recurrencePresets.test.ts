import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { nextOccurrenceAfter, presetToTemplate } from "./recurrencePresets";

// Local-day formatter — using toISOString() would shift by the host TZ
// offset (we run CI in UTC and dev in SGT) and break otherwise-correct
// assertions.
const day = (d: Date) => format(d, "yyyy-MM-dd");

describe("presetToTemplate", () => {
  it("DAILY", () => {
    expect(
      presetToTemplate({
        preset: "DAILY",
        customFrequency: "WEEKLY",
        customInterval: 1,
        weekdays: [],
        endDate: undefined,
      })
    ).toEqual({
      frequency: "DAILY",
      interval: 1,
      weekdays: [],
      endDate: undefined,
    });
  });
  it("WEEKLY uses provided weekdays", () => {
    expect(
      presetToTemplate({
        preset: "WEEKLY",
        customFrequency: "WEEKLY",
        customInterval: 1,
        weekdays: ["MON", "FRI"],
        endDate: undefined,
      })
    ).toEqual({
      frequency: "WEEKLY",
      interval: 1,
      weekdays: ["MON", "FRI"],
      endDate: undefined,
    });
  });
  it("CUSTOM weekly interval=2 (biweekly via Custom)", () => {
    expect(
      presetToTemplate({
        preset: "CUSTOM",
        customFrequency: "WEEKLY",
        customInterval: 2,
        weekdays: ["MON"],
        endDate: undefined,
      })
    ).toEqual({
      frequency: "WEEKLY",
      interval: 2,
      weekdays: ["MON"],
      endDate: undefined,
    });
  });
  it("CUSTOM monthly interval=3 (every 3 months via Custom)", () => {
    expect(
      presetToTemplate({
        preset: "CUSTOM",
        customFrequency: "MONTHLY",
        customInterval: 3,
        weekdays: [],
        endDate: undefined,
      })
    ).toEqual({
      frequency: "MONTHLY",
      interval: 3,
      weekdays: [],
      endDate: undefined,
    });
  });
  it("YEARLY", () => {
    expect(
      presetToTemplate({
        preset: "YEARLY",
        customFrequency: "WEEKLY",
        customInterval: 1,
        weekdays: [],
        endDate: undefined,
      })
    ).toEqual({
      frequency: "YEARLY",
      interval: 1,
      weekdays: [],
      endDate: undefined,
    });
  });
  it("CUSTOM weekly every 3 weeks on Tue", () => {
    expect(
      presetToTemplate({
        preset: "CUSTOM",
        customFrequency: "WEEKLY",
        customInterval: 3,
        weekdays: ["TUE"],
        endDate: undefined,
      })
    ).toEqual({
      frequency: "WEEKLY",
      interval: 3,
      weekdays: ["TUE"],
      endDate: undefined,
    });
  });
  it("end date forwarded", () => {
    const d = new Date("2027-01-01");
    expect(
      presetToTemplate({
        preset: "MONTHLY",
        customFrequency: "WEEKLY",
        customInterval: 1,
        weekdays: [],
        endDate: d,
      })
    ).toMatchObject({ endDate: d });
  });
});

describe("nextOccurrenceAfter", () => {
  // 2026-04-25 is a Saturday — used as the start date in most cases.
  const sat = new Date("2026-04-25T00:00:00");

  it("DAILY interval=1 → next day", () => {
    const r = nextOccurrenceAfter(sat, {
      frequency: "DAILY",
      interval: 1,
      weekdays: [],
    });
    expect(day(r)).toBe("2026-04-26");
  });

  it("DAILY interval=3 → +3 days", () => {
    const r = nextOccurrenceAfter(sat, {
      frequency: "DAILY",
      interval: 3,
      weekdays: [],
    });
    expect(day(r)).toBe("2026-04-28");
  });

  it("WEEKLY interval=1 on MON → next Monday", () => {
    const r = nextOccurrenceAfter(sat, {
      frequency: "WEEKLY",
      interval: 1,
      weekdays: ["MON"],
    });
    expect(day(r)).toBe("2026-04-27");
  });

  it("WEEKLY interval=1 on multiple days → earliest match after start", () => {
    const r = nextOccurrenceAfter(sat, {
      frequency: "WEEKLY",
      interval: 1,
      weekdays: ["MON", "WED", "FRI"],
    });
    expect(day(r)).toBe("2026-04-27");
  });

  it("WEEKLY interval=2 on MON → skips one Monday, lands on the next valid week", () => {
    // Sat 2026-04-25 is week W. Mon 2026-04-27 is in week W+1 (week diff=1),
    // not divisible by 2, so we skip to Mon 2026-05-04 in week W+2.
    const r = nextOccurrenceAfter(sat, {
      frequency: "WEEKLY",
      interval: 2,
      weekdays: ["MON"],
    });
    expect(day(r)).toBe("2026-05-04");
  });

  it("MONTHLY interval=1 → same date next month", () => {
    const r = nextOccurrenceAfter(sat, {
      frequency: "MONTHLY",
      interval: 1,
      weekdays: [],
    });
    expect(day(r)).toBe("2026-05-25");
  });

  it("MONTHLY interval=3 → +3 months", () => {
    const r = nextOccurrenceAfter(sat, {
      frequency: "MONTHLY",
      interval: 3,
      weekdays: [],
    });
    expect(day(r)).toBe("2026-07-25");
  });

  it("YEARLY interval=1 → same date next year", () => {
    const r = nextOccurrenceAfter(sat, {
      frequency: "YEARLY",
      interval: 1,
      weekdays: [],
    });
    expect(day(r)).toBe("2027-04-25");
  });
});
