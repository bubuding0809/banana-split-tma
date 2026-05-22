import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { requireField } from "../lib/tools/parse";

type Input = {
  /** Recurring template UUID */
  templateId: string;
};

/** Get recurring template details. */
export default async function tool(input: Input) {
  return withToolErrors("get-recurring-expense", input, async () => {
    const templateId = requireField(input.templateId, "templateId");
    return runTool("get-recurring-expense", input, (trpc) => trpc.expense.recurring.get.query({ templateId }));
  });
}
