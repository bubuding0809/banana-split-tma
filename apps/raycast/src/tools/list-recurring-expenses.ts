import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
};

/** List active recurring expense templates. */
export default async function tool(input: Input) {
  return withToolErrors("list-recurring-expenses", input, async () => {
    return runTool("list-recurring-expenses", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return trpc.expense.recurring.list.query({ chatId });
    });
  });
}
