import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { getExpense, requireField } from "@bananasplitz/api-ops";

type Input = {
  /** Expense UUID */
  expenseId: string;
};

/** Get full expense details including split. */
export default async function tool(input: Input) {
  return withToolErrors("get-expense", input, async () => {
    return runTool("get-expense", input, (trpc) =>
      getExpense(trpc, { expenseId: requireField(input.expenseId, "expenseId") }),
    );
  });
}
