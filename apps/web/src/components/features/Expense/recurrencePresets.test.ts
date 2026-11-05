import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import {
  nextOccurrenceAfter,
  nextUpcomingOccurrence,
  presetToTemplate,
} from "./recurrencePresets";

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

describe("nextUpcomingOccurrence", () => {
  const every4WeeksThu = {
    frequency: "WEEKLY" as const,
    interval: 4,
    weekdays: ["THU" as const],
  };
  // Thu 13 Aug 2026, 09:00 local
  const anchor = new Date(2026, 7, 13, 9, 0);

  it("returns the anchor itself when it is still in the future", () => {
    const now = new Date(2026, 7, 1);
    expect(day(nextUpcomingOccurrence(anchor, every4WeeksThu, now))).toBe(
      "2026-08-13"
    );
  });

  it("walks forward past now instead of stopping one step after anchor", () => {
    // 6 Nov 2026 — fires were 13 Aug, 10 Sep, 8 Oct, 5 Nov
    const now = new Date(2026, 10, 6);
    expect(day(nextUpcomingOccurrence(anchor, every4WeeksThu, now))).toBe(
      "2026-12-03"
    );
  });

  it("counts an occurrence later today as upcoming", () => {
    const now = new Date(2026, 10, 5, 8, 0); // 5 Nov 08:00, fire at 09:00
    expect(day(nextUpcomingOccurrence(anchor, every4WeeksThu, now))).toBe(
      "2026-11-05"
    );
  });

  it("handles multi-weekday weekly with interval > 1", () => {
    // Mon 2 Nov 2026 anchor, every 2 weeks on Mon + Thu
    const a = new Date(2026, 10, 2, 9, 0);
    const tmpl = {
      frequency: "WEEKLY" as const,
      interval: 2,
      weekdays: ["MON" as const, "THU" as const],
    };
    // After Mon 2 Nov -> Thu 5 Nov -> Mon 16 Nov (skip week of 9 Nov)
    expect(day(nextUpcomingOccurrence(a, tmpl, new Date(2026, 10, 6)))).toBe(
      "2026-11-16"
    );
  });

  it("monthly", () => {
    const a = new Date(2026, 0, 15, 9, 0);
    const tmpl = { frequency: "MONTHLY" as const, interval: 1, weekdays: [] };
    expect(day(nextUpcomingOccurrence(a, tmpl, new Date(2026, 10, 20)))).toBe(
      "2026-12-15"
    );
  });
});

describe("nextUpcomingOccurrence month-end", () => {
  // AWS cron `cron(0 9 31 * ? *)` skips months without a 31st, so the
  // walk must neither drift to the 28th nor clamp to the 30th.
  it("monthly on the 31st skips short months without drifting", () => {
    const a = new Date(2026, 0, 31, 9, 0);
    const tmpl = { frequency: "MONTHLY" as const, interval: 1, weekdays: [] };
    expect(day(nextUpcomingOccurrence(a, tmpl, new Date(2026, 3, 10)))).toBe(
      "2026-05-31"
    );
    expect(day(nextUpcomingOccurrence(a, tmpl, new Date(2026, 1, 1)))).toBe(
      "2026-03-31"
    );
  });

  it("yearly on 29 Feb only lands on leap years", () => {
    const a = new Date(2024, 1, 29, 9, 0);
    const tmpl = { frequency: "YEARLY" as const, interval: 1, weekdays: [] };
    expect(day(nextUpcomingOccurrence(a, tmpl, new Date(2024, 5, 1)))).toBe(
      "2028-02-29"
    );
  });
});
