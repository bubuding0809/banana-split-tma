import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { createExpense } from "@bananasplitz/api-ops";

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
    return runTool("create-expense", input, (trpc) =>
      createExpense(trpc, {
        chatId: input.chatId,
        payerId: input.payerId,
        creatorId: input.creatorId,
        description: input.description,
        amount: input.amount,
        currency: input.currency,
        splitMode: input.splitMode,
        participantIds: input.participantIds,
        customSplits: input.customSplits,
        date: input.date,
        category: input.category,
        recurrenceFrequency: input.recurrenceFrequency,
        recurrenceInterval: input.recurrenceInterval,
        recurrenceWeekdays: input.recurrenceWeekdays,
        recurrenceEndDate: input.recurrenceEndDate,
        recurrenceTimezone: input.recurrenceTimezone,
      }),
    );
  });
}
