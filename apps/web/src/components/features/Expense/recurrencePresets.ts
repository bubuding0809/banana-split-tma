export type RecurrencePreset =
  | "NONE"
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "EVERY_3_MONTHS"
  | "EVERY_6_MONTHS"
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
    case "BIWEEKLY":
      return {
        frequency: "WEEKLY",
        interval: 2,
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
    case "EVERY_3_MONTHS":
      return {
        frequency: "MONTHLY",
        interval: 3,
        weekdays: [],
        endDate: input.endDate,
      };
    case "EVERY_6_MONTHS":
      return {
        frequency: "MONTHLY",
        interval: 6,
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
  BIWEEKLY: "Biweekly",
  MONTHLY: "Monthly",
  EVERY_3_MONTHS: "Every 3 Months",
  EVERY_6_MONTHS: "Every 6 Months",
  YEARLY: "Yearly",
  CUSTOM: "Custom",
};

// Inlined here (instead of imported from @dko/trpc) so the web bundle does
// not pull in server-only deps like @trpc/server's node-http adapter.
import { format } from "date-fns";

export interface RecurrenceSummaryInput {
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  endDate: Date | null;
}

const WEEKDAY_LABEL: Record<Weekday, string> = {
  SUN: "Sun",
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
};

const UNIT_SINGULAR: Record<CanonicalFrequency, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};

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
