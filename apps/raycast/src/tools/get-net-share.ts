import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { parseNumber, requireField } from "../lib/tools/parse";

type Input = {
  /** User whose perspective to calculate from */
  mainUserId: string;
  /** Other user in the balance calculation */
  targetUserId: string;
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
  /** 3-letter currency code (required) */
  currency: string;
};

/** Net balance between two users in one currency. */
export default async function tool(input: Input) {
  return withToolErrors("get-net-share", input, async () => {
    const currency = requireField(input.currency, "currency");
    const mainUserId = parseNumber(requireField(input.mainUserId, "mainUserId"), "mainUserId");
    const targetUserId = parseNumber(requireField(input.targetUserId, "targetUserId"), "targetUserId");

    return runTool("get-net-share", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return trpc.expenseShare.getNetShare.query({
        mainUserId,
        targetUserId,
        chatId,
        currency,
      });
    });
  });
}
