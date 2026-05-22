import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { parseCommaSeparatedNumbers, parseJsonArray, parsePositiveNumber, requireField } from "../lib/tools/parse";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
  /** User ID who paid */
  payerId: string;
  /** User ID creating the expense (defaults to payerId) */
  creatorId?: string;
  /** Short description (max 60 chars) */
  description: string;
  /** Total amount */
  amount: string;
  /** 3-letter currency (defaults to chat base) */
  currency?: string;
  /** EQUAL, EXACT, PERCENTAGE, or SHARES */
  splitMode: string;
  /** Comma-separated participant user IDs */
  participantIds: string;
  /** JSON array for non-EQUAL splits: [{"userId":123,"amount":30}] */
  customSplits?: string;
  /** ISO 8601 date (defaults to now) */
  date?: string;
  /** Category id (base:food or chat:<uuid>) */
  category?: string;
  /** DAILY, WEEKLY, MONTHLY, or YEARLY for recurring template */
  recurrenceFrequency?: string;
  recurrenceInterval?: string;
  /** Comma-separated weekdays for weekly (MON,WED) */
  recurrenceWeekdays?: string;
  recurrenceEndDate?: string;
  recurrenceTimezone?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  return {
    message: `Create expense "${input.description}" for ${input.amount}${input.currency ? ` ${input.currency}` : ""}? May notify group members.`,
    info: [
      { name: "Payer", value: String(input.payerId) },
      { name: "Split", value: input.splitMode },
      { name: "Participants", value: input.participantIds },
    ],
  };
};

/** Create a new expense (optionally with recurrence). */
export default async function tool(input: Input) {
  return withToolErrors("create-expense", input, async () => {
    const payerId = parsePositiveNumber(requireField(input.payerId, "payerId"), "payerId");
    const amount = parsePositiveNumber(requireField(input.amount, "amount"), "amount");
    const description = requireField(input.description, "description");
    const splitMode = requireField(input.splitMode, "splitMode") as "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";
    const participantIds = parseCommaSeparatedNumbers(
      requireField(input.participantIds, "participantIds"),
      "participantIds",
    );
    const creatorId = input.creatorId ? parsePositiveNumber(input.creatorId, "creatorId") : payerId;

    let customSplits: { userId: number; amount: number }[] | undefined;
    if (input.customSplits) {
      customSplits = parseJsonArray<{ userId: number; amount: number }>(input.customSplits, "customSplits");
    }

    let date: Date | undefined;
    if (input.date) {
      date = new Date(input.date);
      if (Number.isNaN(date.getTime())) throw new Error("date must be a valid ISO 8601 string");
    }

    const frequency = input.recurrenceFrequency?.toUpperCase();
    let recurrenceParams:
      | {
          frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
          interval: number;
          weekdays: ("SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT")[];
          endDate?: Date;
          timezone: string;
        }
      | undefined;

    if (
      !frequency &&
      (input.recurrenceInterval || input.recurrenceWeekdays || input.recurrenceEndDate || input.recurrenceTimezone)
    ) {
      throw new Error("recurrence options require recurrenceFrequency");
    }

    if (frequency) {
      const timezone = input.recurrenceTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(frequency)) {
        throw new Error("recurrenceFrequency must be DAILY, WEEKLY, MONTHLY, or YEARLY");
      }
      const interval = input.recurrenceInterval ? Number(input.recurrenceInterval) : 1;
      if (!Number.isInteger(interval) || interval <= 0) {
        throw new Error("recurrenceInterval must be a positive integer");
      }

      let weekdays: string[] | undefined;
      if (input.recurrenceWeekdays) {
        weekdays = input.recurrenceWeekdays.split(",").map((s) => s.trim().toUpperCase());
        const valid = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
        if (weekdays.some((w) => !valid.includes(w))) {
          throw new Error("recurrenceWeekdays must be SUN,MON,...");
        }
      } else if (frequency === "WEEKLY") {
        const baseDate = date ?? new Date();
        const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
        weekdays = [DAY_NAMES[baseDate.getDay()]!];
      }

      let endDate: Date | undefined;
      if (input.recurrenceEndDate) {
        endDate = new Date(input.recurrenceEndDate);
        if (Number.isNaN(endDate.getTime())) {
          throw new Error("recurrenceEndDate must be valid ISO 8601");
        }
        const baseDate = date ?? new Date();
        if (endDate < baseDate) {
          throw new Error("recurrenceEndDate cannot be before expense date");
        }
      }

      recurrenceParams = {
        frequency: frequency as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
        interval,
        weekdays: (weekdays ?? []) as ("SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT")[],
        endDate,
        timezone,
      };
    }

    return runTool("create-expense", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      const payload = {
        chatId,
        creatorId,
        payerId,
        description,
        amount,
        currency: input.currency,
        date,
        splitMode,
        participantIds,
        customSplits,
        categoryId: input.category,
        sendNotification: true,
      };

      if (recurrenceParams) {
        return trpc.expense.createExpenseWithRecurrence.mutate({
          expense: payload,
          recurrence: recurrenceParams,
        });
      }
      return trpc.expense.createExpense.mutate(payload);
    });
  });
}
