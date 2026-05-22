import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
};

export const confirmation: Tool.Confirmation<Input> = async () => ({
  message: "Send a group debt reminder to this Telegram chat?",
});

/** Send a group debt reminder message. */
export default async function tool(input: Input) {
  return withToolErrors("send-group-reminder", input, async () => {
    return runTool("send-group-reminder", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return trpc.telegram.sendGroupReminderMessage.mutate({
        chatId: chatId.toString(),
      });
    });
  });
}
