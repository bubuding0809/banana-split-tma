import { describe, it, expect } from "vitest";
import { presetToTemplate } from "./recurrencePresets";

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
  it("BIWEEKLY → WEEKLY interval=2", () => {
    expect(
      presetToTemplate({
        preset: "BIWEEKLY",
        customFrequency: "WEEKLY",
        customInterval: 1,
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
  it("EVERY_3_MONTHS → MONTHLY interval=3", () => {
    expect(
      presetToTemplate({
        preset: "EVERY_3_MONTHS",
        customFrequency: "WEEKLY",
        customInterval: 1,
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
  it("EVERY_6_MONTHS → MONTHLY interval=6", () => {
    expect(
      presetToTemplate({
        preset: "EVERY_6_MONTHS",
        customFrequency: "WEEKLY",
        customInterval: 1,
        weekdays: [],
        endDate: undefined,
      })
    ).toEqual({
      frequency: "MONTHLY",
      interval: 6,
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
