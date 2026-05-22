import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { requireField } from "../lib/tools/parse";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
  /** 3-letter currency code (required), e.g. USD or SGD */
  currency: string;
};

/** Get optimized debt graph for one currency in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("get-simplified-debts", input, async () => {
    const currency = requireField(input.currency, "currency");
    return runTool("get-simplified-debts", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return trpc.chat.getSimplifiedDebts.query({ chatId, currency });
    });
  });
}
