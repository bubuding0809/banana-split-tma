export type CronFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type CronWeekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export interface BuildExpenseCronInput {
  frequency: CronFrequency;
  interval: number; // >= 1
  weekdays: CronWeekday[]; // required for WEEKLY
  hour: number; // 0-23
  minute: number; // 0-59
  dayOfMonth?: number; // 1-31, required for MONTHLY/YEARLY
  month?: number; // 1-12, required for YEARLY
}

/**
 * Build an AWS EventBridge cron expression from structured inputs.
 *
 * AWS cron format: cron(minute hour day-of-month month day-of-week year)
 * Note: day-of-month and day-of-week are mutually exclusive — exactly one
 * must be `?`.
 *
 * Biweekly (WEEKLY interval=2) is emitted as a weekly cron — the tick
 * endpoint is responsible for skipping every other occurrence based on
 * the template's startDate.
 */
export function buildExpenseCron(input: BuildExpenseCronInput): string {
  const { frequency, interval, weekdays, hour, minute, dayOfMonth, month } =
    input;

  if (frequency === "WEEKLY" && weekdays.length === 0) {
    throw new Error("WEEKLY frequency requires at least one weekday");
  }
  if ((frequency === "MONTHLY" || frequency === "YEARLY") && !dayOfMonth) {
    throw new Error(`${frequency} frequency: dayOfMonth required`);
  }
  if (frequency === "YEARLY" && !month) {
    throw new Error("YEARLY frequency requires month");
  }

  const m = String(minute);
  const h = String(hour);

  switch (frequency) {
    case "DAILY": {
      const dom = interval === 1 ? "*" : `1/${interval}`;
      return `cron(${m} ${h} ${dom} * ? *)`;
    }
    case "WEEKLY": {
      const dow = weekdays.join(",");
      return `cron(${m} ${h} ? * ${dow} *)`;
    }
    case "MONTHLY": {
      const mon = interval === 1 ? "*" : `1/${interval}`;
      return `cron(${m} ${h} ${dayOfMonth} ${mon} ? *)`;
    }
    case "YEARLY": {
      return `cron(${m} ${h} ${dayOfMonth} ${month} ? *)`;
    }
  }
}
