import { describe, it, expect } from "vitest";
import { formatRecurrenceSummary } from "./recurrenceSummary.js";

describe("formatRecurrenceSummary", () => {
  it("daily, no end", () => {
    expect(
      formatRecurrenceSummary({
        frequency: "DAILY",
        interval: 1,
        weekdays: [],
        endDate: null,
      })
    ).toBe("Every day");
  });
  it("every 3 days", () => {
    expect(
      formatRecurrenceSummary({
        frequency: "DAILY",
        interval: 3,
        weekdays: [],
        endDate: null,
      })
    ).toBe("Every 3 days");
  });
  it("weekly on Mon, Fri", () => {
    expect(
      formatRecurrenceSummary({
        frequency: "WEEKLY",
        interval: 1,
        weekdays: ["MON", "FRI"],
        endDate: null,
      })
    ).toBe("Weekly on Mon, Fri");
  });
  it("biweekly on Mon", () => {
    expect(
      formatRecurrenceSummary({
        frequency: "WEEKLY",
        interval: 2,
        weekdays: ["MON"],
        endDate: null,
      })
    ).toBe("Every 2 weeks on Mon");
  });
  it("monthly", () => {
    expect(
      formatRecurrenceSummary({
        frequency: "MONTHLY",
        interval: 1,
        weekdays: [],
        endDate: null,
      })
    ).toBe("Monthly");
  });
  it("every 3 months", () => {
    expect(
      formatRecurrenceSummary({
        frequency: "MONTHLY",
        interval: 3,
        weekdays: [],
        endDate: null,
      })
    ).toBe("Every 3 months");
  });
  it("yearly until a date", () => {
    expect(
      formatRecurrenceSummary({
        frequency: "YEARLY",
        interval: 1,
        weekdays: [],
        endDate: new Date("2027-12-31"),
      })
    ).toBe("Yearly until 31 Dec 2027");
  });
});
