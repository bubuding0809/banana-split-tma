import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { getRecurringExpense, requireField } from "@bananasplitz/api-ops";

type Input = {
  /** Template UUID */
  templateId: string;
};

/** Get recurring expense template details. */
export default async function tool(input: Input) {
  return withToolErrors("get-recurring-expense", input, async () => {
    return runTool("get-recurring-expense", input, (trpc) =>
      getRecurringExpense(trpc, {
        templateId: requireField(input.templateId, "templateId"),
      }),
    );
  });
}
