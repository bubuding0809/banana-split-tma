import { Action, Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { requireField } from "../lib/tools/parse";

type Input = {
  /** Template UUID */
  templateId: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Cancel recurring template ${input.templateId}? Stops future runs only.`,
  style: Action.Style.Destructive,
});

/** Cancel an active recurring template. */
export default async function tool(input: Input) {
  return withToolErrors("cancel-recurring-expense", input, async () => {
    const templateId = requireField(input.templateId, "templateId");
    return runTool("cancel-recurring-expense", input, (trpc) => trpc.expense.recurring.cancel.mutate({ templateId }));
  });
}
