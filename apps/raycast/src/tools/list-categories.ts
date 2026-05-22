import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
};

/** List base + custom categories in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("list-categories", input, async () => {
    return runTool("list-categories", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return trpc.category.listByChat.query({ chatId });
    });
  });
}
