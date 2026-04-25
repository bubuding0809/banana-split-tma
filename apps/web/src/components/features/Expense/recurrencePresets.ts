export type RecurrencePreset =
  | "NONE"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "YEARLY"
  | "CUSTOM";

export type CanonicalFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export interface PresetInput {
  preset: Exclude<RecurrencePreset, "NONE">;
  customFrequency: CanonicalFrequency;
  customInterval: number;
  weekdays: Weekday[];
  endDate?: Date;
}

export interface CanonicalTemplate {
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  endDate?: Date;
}

export function presetToTemplate(input: PresetInput): CanonicalTemplate {
  switch (input.preset) {
    case "DAILY":
      return {
        frequency: "DAILY",
        interval: 1,
        weekdays: [],
        endDate: input.endDate,
      };
    case "WEEKLY":
      return {
        frequency: "WEEKLY",
        interval: 1,
        weekdays: input.weekdays,
        endDate: input.endDate,
      };
    case "MONTHLY":
      return {
        frequency: "MONTHLY",
        interval: 1,
        weekdays: [],
        endDate: input.endDate,
      };
    case "YEARLY":
      return {
        frequency: "YEARLY",
        interval: 1,
        weekdays: [],
        endDate: input.endDate,
      };
    case "CUSTOM":
      return {
        frequency: input.customFrequency,
        interval: input.customInterval,
        weekdays: input.weekdays,
        endDate: input.endDate,
      };
  }
}

export const PRESET_LABEL: Record<RecurrencePreset, string> = {
  NONE: "Never",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
  CUSTOM: "Custom",
};

// Inlined here (instead of imported from @dko/trpc) so the web bundle does
// not pull in server-only deps like @trpc/server's node-http adapter.
import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarWeeks,
  format,
  getDay,
} from "date-fns";

const WEEKDAY_TO_INDEX: Record<Weekday, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

/**
 * First recurring occurrence strictly AFTER `start`, given the canonical
 * template. Used by end-date validation to ensure the user picks an end
 * date that allows at least one future fire beyond the original
 * transaction date.
 *
 * - DAILY  → start + N days
 * - WEEKLY → next chosen weekday whose calendar-week distance from start
 *            is a multiple of `interval` (matches RRULE semantics).
 *            Falls back to start + 7*N days when no weekdays are set
 *            (shouldn't happen — schema requires at least one).
 * - MONTHLY → start + N months (date-fns clamps Jan 31 → Feb 28 etc.)
 * - YEARLY → start + N years (clamps Feb 29 in non-leap years).
 */
export function nextOccurrenceAfter(
  start: Date,
  template: CanonicalTemplate
): Date {
  const { frequency, interval, weekdays } = template;
  switch (frequency) {
    case "DAILY":
      return addDays(start, interval);
    case "MONTHLY":
      return addMonths(start, interval);
    case "YEARLY":
      return addYears(start, interval);
    case "WEEKLY": {
      if (weekdays.length === 0) return addDays(start, 7 * interval);
      const wantedIdx = new Set(weekdays.map((w) => WEEKDAY_TO_INDEX[w]));
      // Bounded scan: worst case the next valid occurrence is 7*interval
      // days away (interval weeks of skip + back to the earliest weekday).
      // +7 padding handles the start-mid-week case.
      for (let i = 1; i <= 7 * interval + 7; i++) {
        const candidate = addDays(start, i);
        if (!wantedIdx.has(getDay(candidate))) continue;
        const weekDiff = differenceInCalendarWeeks(candidate, start, {
          weekStartsOn: 0,
        });
        if (weekDiff % interval === 0) return candidate;
      }
      return addDays(start, 7 * interval);
    }
  }
}

export interface RecurrenceSummaryInput {
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  endDate: Date | null;
}

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  SUN: "Sun",
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
};

export const UNIT_SINGULAR: Record<CanonicalFrequency, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};

/**
 * Split summary used by the two-cell pattern (body + after) so the row
 * reads as "Every | <weekdays>" or "Every N weeks | <weekdays>" with the
 * left side anchored to the body slot and the right side to the after
 * slot. Returns `null` when there's nothing worth showing on a second
 * row (e.g. plain "Daily" / "Monthly" — the Repeat row already says it).
 */
export function splitRecurrenceSummary(input: {
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
}): { left: string; right: string } | null {
  const { frequency, interval, weekdays } = input;
  const days = weekdays.map((w) => WEEKDAY_LABEL[w]).join(", ");

  if (interval === 1) {
    if (frequency === "WEEKLY" && weekdays.length) {
      return { left: "Every", right: days };
    }
    return null;
  }

  const unit = `${UNIT_SINGULAR[frequency]}s`;
  if (frequency === "WEEKLY" && weekdays.length) {
    return { left: `Every ${interval} ${unit}`, right: days };
  }
  return { left: "Every", right: `${interval} ${unit}` };
}

export function formatRecurrenceSummary(input: RecurrenceSummaryInput): string {
  const { frequency, interval, weekdays, endDate } = input;
  let base: string;

  if (interval === 1) {
    base = {
      DAILY: "Every day",
      WEEKLY: weekdays.length
        ? `Weekly on ${weekdays.map((w) => WEEKDAY_LABEL[w]).join(", ")}`
        : "Weekly",
      MONTHLY: "Monthly",
      YEARLY: "Yearly",
    }[frequency];
  } else {
    const unit = `${UNIT_SINGULAR[frequency]}s`;
    base = `Every ${interval} ${unit}`;
    if (frequency === "WEEKLY" && weekdays.length) {
      base += ` on ${weekdays.map((w) => WEEKDAY_LABEL[w]).join(", ")}`;
    }
  }

  if (endDate) {
    return `${base} until ${format(endDate, "d MMM yyyy")}`;
  }
  return base;
}
