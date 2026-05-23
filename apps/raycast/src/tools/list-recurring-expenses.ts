import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { listRecurringExpenses } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
};

/** List active recurring expense templates. */
export default async function tool(input: Input) {
  return withToolErrors("list-recurring-expenses", input, async () => {
    return runTool("list-recurring-expenses", input, (trpc) => listRecurringExpenses(trpc, { chatId: input.chatId }));
  });
}
