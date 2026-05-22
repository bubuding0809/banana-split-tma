import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { parsePositiveNumber, requireField } from "../lib/tools/parse";

type Input = {
  /** Template UUID */
  templateId: string;
  amount?: string;
  description?: string;
  frequency?: string;
  interval?: string;
  /** Comma-separated weekdays (MON,WED) */
  weekdays?: string;
  /** ISO end date or "none" to clear */
  endDate?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Update recurring template ${input.templateId}?`,
});

/** Update recurring expense schedule or details. */
export default async function tool(input: Input) {
  return withToolErrors("update-recurring-expense", input, async () => {
    const templateId = requireField(input.templateId, "templateId");
    const payload: {
      templateId: string;
      amount?: number;
      description?: string;
      frequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
      interval?: number;
      weekdays?: ("SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT")[];
      endDate?: Date | null;
    } = { templateId };

    if (input.amount !== undefined) {
      payload.amount = parsePositiveNumber(input.amount, "amount");
    }
    if (input.description !== undefined) {
      const desc = input.description;
      if (desc.length < 1 || desc.length > 60) {
        throw new Error("description must be between 1 and 60 characters");
      }
      payload.description = desc;
    }
    if (input.frequency !== undefined) {
      const freq = input.frequency.toUpperCase();
      if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
        throw new Error("frequency must be DAILY, WEEKLY, MONTHLY, or YEARLY");
      }
      payload.frequency = freq as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    }
    if (input.interval !== undefined) {
      const ival = Number(input.interval);
      if (!Number.isInteger(ival) || ival <= 0) {
        throw new Error("interval must be a positive integer");
      }
      payload.interval = ival;
    }
    if (input.weekdays !== undefined) {
      const days = input.weekdays.split(",").map((s) => s.trim().toUpperCase());
      const valid = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      if (days.some((d) => !valid.includes(d))) {
        throw new Error("weekdays must be SUN,MON,...");
      }
      payload.weekdays = days as ("SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT")[];
    }
    if (input.endDate !== undefined) {
      if (input.endDate.toLowerCase() === "none") {
        payload.endDate = null;
      } else {
        const ed = new Date(input.endDate);
        if (Number.isNaN(ed.getTime())) {
          throw new Error("endDate must be valid ISO date or 'none'");
        }
        payload.endDate = ed;
      }
    }

    const hasUpdate = [
      input.amount,
      input.description,
      input.frequency,
      input.interval,
      input.weekdays,
      input.endDate,
    ].some((v) => v !== undefined);
    if (!hasUpdate) {
      throw new Error("At least one field to update is required");
    }

    return runTool("update-recurring-expense", input, (trpc) => trpc.expense.recurring.update.mutate(payload));
  });
}
