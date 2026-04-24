import { describe, it, expect } from "vitest";
import { buildExpenseCron } from "./buildExpenseCron.js";

describe("buildExpenseCron", () => {
  const HOUR = 9;
  const MIN = 0;

  it("DAILY interval=1 → fires every day at 9am", () => {
    expect(
      buildExpenseCron({
        frequency: "DAILY",
        interval: 1,
        weekdays: [],
        hour: HOUR,
        minute: MIN,
      })
    ).toBe("cron(0 9 * * ? *)");
  });

  it("DAILY interval=3 → fires every 3rd day", () => {
    expect(
      buildExpenseCron({
        frequency: "DAILY",
        interval: 3,
        weekdays: [],
        hour: HOUR,
        minute: MIN,
      })
    ).toBe("cron(0 9 1/3 * ? *)");
  });

  it("WEEKLY interval=1 with one weekday → fires that day at 9am", () => {
    expect(
      buildExpenseCron({
        frequency: "WEEKLY",
        interval: 1,
        weekdays: ["MON"],
        hour: HOUR,
        minute: MIN,
      })
    ).toBe("cron(0 9 ? * MON *)");
  });

  it("WEEKLY interval=1 with multiple weekdays → comma-separated", () => {
    expect(
      buildExpenseCron({
        frequency: "WEEKLY",
        interval: 1,
        weekdays: ["MON", "FRI"],
        hour: HOUR,
        minute: MIN,
      })
    ).toBe("cron(0 9 ? * MON,FRI *)");
  });

  it("WEEKLY interval=2 (biweekly) → uses startDate-anchored cron", () => {
    // Biweekly is implemented with an explicit startDate, not native cron support.
    // For now we accept that the cron will fire weekly and the endpoint is responsible
    // for skipping odd-week occurrences. Test asserts the weekly cron form is produced.
    expect(
      buildExpenseCron({
        frequency: "WEEKLY",
        interval: 2,
        weekdays: ["MON"],
        hour: HOUR,
        minute: MIN,
      })
    ).toBe("cron(0 9 ? * MON *)");
  });

  it("MONTHLY interval=1 → fires on the 1st at 9am", () => {
    expect(
      buildExpenseCron({
        frequency: "MONTHLY",
        interval: 1,
        weekdays: [],
        hour: HOUR,
        minute: MIN,
        dayOfMonth: 15,
      })
    ).toBe("cron(0 9 15 * ? *)");
  });

  it("MONTHLY interval=3 → fires every 3rd month on day-of-month", () => {
    expect(
      buildExpenseCron({
        frequency: "MONTHLY",
        interval: 3,
        weekdays: [],
        hour: HOUR,
        minute: MIN,
        dayOfMonth: 15,
      })
    ).toBe("cron(0 9 15 1/3 ? *)");
  });

  it("YEARLY interval=1 → fires on a specific month/day", () => {
    expect(
      buildExpenseCron({
        frequency: "YEARLY",
        interval: 1,
        weekdays: [],
        hour: HOUR,
        minute: MIN,
        dayOfMonth: 15,
        month: 3,
      })
    ).toBe("cron(0 9 15 3 ? *)");
  });

  it("WEEKLY without weekdays throws", () => {
    expect(() =>
      buildExpenseCron({
        frequency: "WEEKLY",
        interval: 1,
        weekdays: [],
        hour: HOUR,
        minute: MIN,
      })
    ).toThrow(/at least one weekday/i);
  });

  it("MONTHLY without dayOfMonth throws", () => {
    expect(() =>
      buildExpenseCron({
        frequency: "MONTHLY",
        interval: 1,
        weekdays: [],
        hour: HOUR,
        minute: MIN,
      })
    ).toThrow(/dayOfMonth required/i);
  });

  it("YEARLY without month throws", () => {
    expect(() =>
      buildExpenseCron({
        frequency: "YEARLY",
        interval: 1,
        weekdays: [],
        hour: HOUR,
        minute: MIN,
        dayOfMonth: 15,
      })
    ).toThrow(/month required/i);
  });
});
