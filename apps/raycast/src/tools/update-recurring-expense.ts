import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { buildRecurringUpdatePayload, requireField, updateRecurringExpense } from "@bananasplitz/api-ops";

type Input = {
  templateId: string;
  amount?: string;
  description?: string;
  frequency?: string;
  interval?: string;
  weekdays?: string;
  endDate?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Update recurring template ${input.templateId}?`,
});

/** Update a recurring expense template. */
export default async function tool(input: Input) {
  return withToolErrors("update-recurring-expense", input, async () => {
    const payload = buildRecurringUpdatePayload({
      templateId: requireField(input.templateId, "templateId"),
      amount: input.amount,
      description: input.description,
      frequency: input.frequency,
      interval: input.interval,
      weekdays: input.weekdays,
      endDate: input.endDate,
    });

    return runTool("update-recurring-expense", input, (trpc) => updateRecurringExpense(trpc, payload));
  });
}
