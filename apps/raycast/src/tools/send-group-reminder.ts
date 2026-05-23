import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { sendGroupReminder } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
};

export const confirmation: Tool.Confirmation<Input> = async () => ({
  message: "Send a group debt reminder to Telegram?",
});

/** Send a group reminder about outstanding debts. */
export default async function tool(input: Input) {
  return withToolErrors("send-group-reminder", input, async () => {
    return runTool("send-group-reminder", input, (trpc) => sendGroupReminder(trpc, { chatId: input.chatId }));
  });
}
