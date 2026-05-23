import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { sendDebtReminder, validateSendDebtReminderInput } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
  debtorUserId: string;
  debtorName: string;
  debtorUsername?: string;
  creditorName: string;
  amount: string;
  currency?: string;
  threadId?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Send debt reminder to ${input.debtorName} for ${input.amount}${input.currency ? ` ${input.currency}` : ""}?`,
});

/** Send an individual debt reminder in a group. */
export default async function tool(input: Input) {
  return withToolErrors("send-debt-reminder", input, async () => {
    const validated = validateSendDebtReminderInput({
      debtorUserId: input.debtorUserId,
      debtorName: input.debtorName,
      creditorName: input.creditorName,
      amount: input.amount,
    });

    return runTool("send-debt-reminder", input, (trpc) =>
      sendDebtReminder(trpc, {
        chatId: input.chatId,
        ...validated,
        debtorUsername: input.debtorUsername,
        currency: input.currency,
        threadId: input.threadId ? Number(input.threadId) : undefined,
      }),
    );
  });
}
