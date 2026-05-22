import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { parseNumber, requireField } from "../lib/tools/parse";

type Input = {
  chatId?: string;
  /** Debtor Telegram user ID */
  debtorUserId: string;
  debtorName: string;
  debtorUsername?: string;
  creditorName: string;
  amount: string;
  currency?: string;
  threadId?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Send debt reminder: ${input.debtorName} owes ${input.amount}${input.currency ? ` ${input.currency}` : ""} to ${input.creditorName}?`,
  info: [
    { name: "Debtor", value: input.debtorName },
    { name: "Creditor", value: input.creditorName },
    { name: "Amount", value: String(input.amount) },
  ],
});

/** Send an individual debt reminder in a Telegram group. */
export default async function tool(input: Input) {
  return withToolErrors("send-debt-reminder", input, async () => {
    const debtorUserId = parseNumber(requireField(input.debtorUserId, "debtorUserId"), "debtorUserId");
    const debtorName = requireField(input.debtorName, "debtorName");
    const creditorName = requireField(input.creditorName, "creditorName");
    const amount = parseFloat(String(requireField(input.amount, "amount")));

    return runTool("send-debt-reminder", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      const payload: {
        chatId: number;
        debtorUserId: number;
        debtorName: string;
        creditorName: string;
        amount: number;
        debtorUsername?: string;
        currency?: string;
        threadId?: number;
      } = { chatId, debtorUserId, debtorName, creditorName, amount };

      if (input.debtorUsername) payload.debtorUsername = input.debtorUsername;
      if (input.currency) payload.currency = input.currency;
      if (input.threadId !== undefined) {
        payload.threadId = parseNumber(input.threadId, "threadId");
      }

      return trpc.telegram.sendDebtReminderMessage.mutate(payload);
    });
  });
}
