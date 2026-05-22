import { Action, Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { requireField } from "../lib/tools/parse";

type Input = {
  /** Expense UUID */
  expenseId: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Delete expense ${input.expenseId}? This cannot be undone.`,
  style: Action.Style.Destructive,
});

/** Delete an expense permanently. */
export default async function tool(input: Input) {
  return withToolErrors("delete-expense", input, async () => {
    const expenseId = requireField(input.expenseId, "expenseId");
    return runTool("delete-expense", input, (trpc) => trpc.expense.deleteExpense.mutate({ expenseId }));
  });
}
