import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { parseNumber, requireField } from "../lib/tools/parse";

type Input = {
  /** User ID to check totals for */
  userId: string;
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
};

/** Total borrowed and lent for a user in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("get-totals", input, async () => {
    const userId = parseNumber(requireField(input.userId, "userId"), "userId");
    return runTool("get-totals", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      const [borrowed, lent] = await Promise.all([
        trpc.expenseShare.getTotalBorrowed.query({ userId, chatId }),
        trpc.expenseShare.getTotalLent.query({ userId, chatId }),
      ]);
      return { borrowed, lent };
    });
  });
}
