import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { parseUpdateExpensePatch, updateExpense, type ExpenseSplitMode } from "@bananasplitz/api-ops";

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
    const patch = parseUpdateExpensePatch({
      expenseId: input.expenseId,
      payerId: input.payerId,
      creatorId: input.creatorId,
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      splitMode: input.splitMode as ExpenseSplitMode | undefined,
      participantIds: input.participantIds,
      customSplits: input.customSplits,
      date: input.date,
      category: input.category,
    });

    return runTool("update-expense", input, (trpc) => updateExpense(trpc, { patch, chatId: input.chatId }));
  });
}
