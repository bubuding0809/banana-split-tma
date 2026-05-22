import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { requireField } from "../lib/tools/parse";

type Input = {
  /** Expense UUID */
  expenseId: string;
};

/** Get full expense details including split. */
export default async function tool(input: Input) {
  return withToolErrors("get-expense", input, async () => {
    const expenseId = requireField(input.expenseId, "expenseId");
    return runTool("get-expense", input, (trpc) => trpc.expense.getExpenseDetails.query({ expenseId }));
  });
}
