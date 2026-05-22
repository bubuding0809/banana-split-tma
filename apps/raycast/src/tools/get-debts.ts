import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
  /** Comma-separated 3-letter currency codes (e.g. USD,SGD) */
  currencies?: string;
};

/** Get all outstanding debts in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("get-debts", input, async () => {
    return runTool("get-debts", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      const currencies = input.currencies?.split(",").map((c) => c.trim());
      return trpc.chat.getBulkChatDebts.query({ chatId, currencies });
    });
  });
}
