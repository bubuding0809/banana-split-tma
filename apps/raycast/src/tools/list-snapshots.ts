import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
};

/** List expense snapshots in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("list-snapshots", input, async () => {
    return runTool("list-snapshots", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return trpc.snapshot.getByChat.query({ chatId });
    });
  });
}
