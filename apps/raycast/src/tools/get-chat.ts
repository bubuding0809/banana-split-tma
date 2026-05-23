import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { getChat } from "@bananasplitz/api-ops";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
};

/** Get chat details and member list. */
export default async function tool(input: Input) {
  return withToolErrors("get-chat", input, async () => {
    return runTool("get-chat", input, (trpc) => getChat(trpc, { chatId: input.chatId }));
  });
}
