import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { applyExpensePartialUpdate, type ExpenseSplitMode, type ExpenseUpdatePatch } from "../lib/tools/expense-update";
import { parseCommaSeparatedNumbers, parseJsonArray, parsePositiveNumber, requireField } from "../lib/tools/parse";

type Input = {
  /** Expense UUID */
  expenseId: string;
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
  payerId?: string;
  creatorId?: string;
  description?: string;
  amount?: string;
  currency?: string;
  splitMode?: string;
  /** Comma-separated participant user IDs */
  participantIds?: string;
  customSplits?: string;
  date?: string;
  /** Category id, or "none" to clear */
  category?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Update expense ${input.expenseId}? May notify group members.`,
  info: input.amount
    ? [{ name: "New amount", value: String(input.amount) }]
    : [{ name: "Expense", value: input.expenseId }],
});

/** Update an existing expense (partial patch). */
export default async function tool(input: Input) {
  return withToolErrors("update-expense", input, async () => {
    const patch: ExpenseUpdatePatch = {
      expenseId: requireField(input.expenseId, "expenseId"),
    };

    if (input.payerId !== undefined) {
      patch.payerId = parsePositiveNumber(input.payerId, "payerId");
    }
    if (input.amount !== undefined) {
      patch.amount = parsePositiveNumber(input.amount, "amount");
    }
    if (input.creatorId !== undefined) {
      patch.creatorId = parsePositiveNumber(input.creatorId, "creatorId");
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.splitMode !== undefined) {
      patch.splitMode = input.splitMode as ExpenseSplitMode;
    }
    if (input.participantIds !== undefined) {
      patch.participantIds = parseCommaSeparatedNumbers(input.participantIds, "participantIds");
    }
    if (input.customSplits !== undefined) {
      patch.customSplits = parseJsonArray<{ userId: number; amount: number }>(input.customSplits, "customSplits");
    }
    if (input.date !== undefined) {
      const date = new Date(input.date);
      if (Number.isNaN(date.getTime())) throw new Error("date must be valid ISO 8601");
      patch.date = date;
    }
    if (input.category !== undefined) {
      patch.categoryId = input.category === "none" ? null : input.category;
    }

    return runTool("update-expense", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return applyExpensePartialUpdate(patch, trpc, chatId);
    });
  });
}
