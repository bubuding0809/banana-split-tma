import { format } from "date-fns";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export interface RecurrenceSummaryInput {
  frequency: Frequency;
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

const UNIT_SINGULAR: Record<Frequency, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};

/**
 * Render a recurrence template's structured fields as a human-readable
 * summary string, e.g. "Every 2 weeks on Mon, Fri" or
 * "Yearly until 31 Dec 2027".
 *
 * Style:
 * - interval=1 uses prefix form ("Weekly on Mon, Fri", "Monthly").
 * - interval>1 uses "Every N units" form, pluralizing the unit.
 * - WEEKLY appends ", on <weekdays>" when weekdays are provided.
 * - endDate, when present, is appended as "until <d MMM yyyy>".
 */
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
