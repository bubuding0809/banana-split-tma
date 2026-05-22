import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
};

/** Get chat details and member list. */
export default async function tool(input: Input) {
  return withToolErrors("get-chat", input, async () => {
    return runTool("get-chat", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return trpc.chat.getChat.query({ chatId });
    });
  });
}
