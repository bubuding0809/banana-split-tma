import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
  /** Filter by 3-letter currency code */
  currency?: string;
};

/** List settlements in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("list-settlements", input, async () => {
    return runTool("list-settlements", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return trpc.settlement.getSettlementByChat.query({
        chatId,
        currency: input.currency,
      });
    });
  });
}
