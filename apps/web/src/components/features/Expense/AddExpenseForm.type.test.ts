import { describe, it, expect } from "vitest";
import {
  expenseFormBaseSchema,
  expenseFormSchema,
} from "./AddExpenseForm.type";

// Builds a minimum-viable form value so individual tests can override only
// the recurrence/date pair under test. Other field-level errors (amount,
// description, etc.) still produce zod issues — checks below filter for
// the cross-field "End date must be on or after …" message produced by the
// outer superRefine, which is the only thing this suite cares about.
function build(
  overrides: Partial<{
    date: string;
    preset: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";
    customFrequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    customInterval: number;
    weekdays: ("SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT")[];
    endDate: string | undefined;
  }>
) {
  const {
    date = "2026-04-25", // Sat
    preset = "WEEKLY",
    customFrequency = "WEEKLY",
    customInterval = 1,
    weekdays = ["MON"],
    endDate = undefined,
  } = overrides;
  return {
    amount: "10.00",
    currency: "SGD",
    description: "lunch",
    date,
    payee: "u1",
    splitMode: "EQUAL" as const,
    participants: ["u1"],
    categoryId: null,
    autoPicked: false,
    userTouchedCategory: false,
    suggestPending: false,
    customSplits: [],
    recurrence:
      preset === "NONE"
        ? { preset: "NONE" as const }
        : {
            preset,
            customFrequency,
            customInterval,
            weekdays,
            endDate,
          },
  };
}

// True when the parse failed with the cross-field end-date issue at the
// recurrence path. Other zod issues (e.g. WEEKLY without weekdays from the
// inner superRefine) are ignored.
function hasEndDateError(value: unknown): boolean {
  const result = expenseFormSchema.safeParse(value);
  if (result.success) return false;
  return result.error.issues.some(
    (i) =>
      i.path[0] === "recurrence" &&
      typeof i.message === "string" &&
      i.message.startsWith("End date must be on or after")
  );
}

describe("expenseFormBaseSchema.shape", () => {
  // Regression: AmountFormStep reads .shape.description._def.checks to
  // surface the description max length. The wrapped expenseFormSchema is a
  // ZodEffects (no .shape), so consumers must reach through the base.
  it("exposes description with a max-length check", () => {
    const checks = expenseFormBaseSchema.shape.description._def.checks;
    const max = checks.find((c) => c.kind === "max");
    expect(max).toBeDefined();
    expect((max as { value: number }).value).toBe(60);
  });
});

describe("expenseFormSchema — endDate cross-field validation", () => {
  it("NONE recurrence: no endDate check runs", () => {
    expect(hasEndDateError(build({ preset: "NONE" }))).toBe(false);
  });

  it("recurrence set, no endDate: no endDate check runs", () => {
    expect(
      hasEndDateError(
        build({ preset: "WEEKLY", weekdays: ["MON"], endDate: undefined })
      )
    ).toBe(false);
  });

  it("WEEKLY on MON, start Sat, endDate Sun (before next Mon) → invalid", () => {
    expect(
      hasEndDateError(
        build({
          date: "2026-04-25",
          preset: "WEEKLY",
          weekdays: ["MON"],
          endDate: "2026-04-26", // Sun — before the next Mon (Apr 27)
        })
      )
    ).toBe(true);
  });

  it("WEEKLY on MON, start Sat, endDate == next Mon → valid", () => {
    expect(
      hasEndDateError(
        build({
          date: "2026-04-25",
          preset: "WEEKLY",
          weekdays: ["MON"],
          endDate: "2026-04-27",
        })
      )
    ).toBe(false);
  });

  it("WEEKLY on MON, start Sat, endDate after next Mon → valid", () => {
    expect(
      hasEndDateError(
        build({
          date: "2026-04-25",
          preset: "WEEKLY",
          weekdays: ["MON"],
          endDate: "2026-05-10",
        })
      )
    ).toBe(false);
  });

  it("DAILY interval=1, endDate == start → invalid (next is tomorrow)", () => {
    expect(
      hasEndDateError(
        build({
          date: "2026-04-25",
          preset: "DAILY",
          customFrequency: "DAILY",
          customInterval: 1,
          weekdays: [],
          endDate: "2026-04-25",
        })
      )
    ).toBe(true);
  });

  it("DAILY interval=1, endDate == tomorrow → valid", () => {
    expect(
      hasEndDateError(
        build({
          date: "2026-04-25",
          preset: "DAILY",
          customFrequency: "DAILY",
          customInterval: 1,
          weekdays: [],
          endDate: "2026-04-26",
        })
      )
    ).toBe(false);
  });

  it("CUSTOM weekly interval=2 on MON, start Sat: endDate Mon (week+1) → invalid", () => {
    expect(
      hasEndDateError(
        build({
          date: "2026-04-25",
          preset: "CUSTOM",
          customFrequency: "WEEKLY",
          customInterval: 2,
          weekdays: ["MON"],
          endDate: "2026-04-27", // Mon in W+1 — biweekly skips this week
        })
      )
    ).toBe(true);
  });

  it("CUSTOM weekly interval=2 on MON, start Sat: endDate Mon (week+2) → valid", () => {
    expect(
      hasEndDateError(
        build({
          date: "2026-04-25",
          preset: "CUSTOM",
          customFrequency: "WEEKLY",
          customInterval: 2,
          weekdays: ["MON"],
          endDate: "2026-05-04", // Mon in W+2 — first valid biweekly fire
        })
      )
    ).toBe(false);
  });

  it("MONTHLY interval=1, start Jan 31 2026: endDate Feb 15 → invalid (next is Feb 28)", () => {
    expect(
      hasEndDateError(
        build({
          date: "2026-01-31",
          preset: "MONTHLY",
          customFrequency: "MONTHLY",
          customInterval: 1,
          weekdays: [],
          endDate: "2026-02-15",
        })
      )
    ).toBe(true);
  });

  it("MONTHLY interval=1, start Jan 31 2026: endDate Feb 28 → valid (clamped next)", () => {
    expect(
      hasEndDateError(
        build({
          date: "2026-01-31",
          preset: "MONTHLY",
          customFrequency: "MONTHLY",
          customInterval: 1,
          weekdays: [],
          endDate: "2026-02-28",
        })
      )
    ).toBe(false);
  });
});
