import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { parseJsonArray, parsePositiveNumber, requireField, settleAllDebts } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
  senderId: string;
  receiverId: string;
  /** JSON array: [{"currency":"USD","amount":15}] */
  balances: string;
  creditorName?: string;
  debtorName?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Settle all debts between user ${input.senderId} and ${input.receiverId}?`,
});

/** Settle all debts between two users across currencies. */
export default async function tool(input: Input) {
  return withToolErrors("settle-all-debts", input, async () => {
    const balances = parseJsonArray<{ currency: string; amount: number }>(
      requireField(input.balances, "balances"),
      "balances",
    );

    return runTool("settle-all-debts", input, (trpc) =>
      settleAllDebts(trpc, {
        chatId: input.chatId,
        senderId: parsePositiveNumber(requireField(input.senderId, "senderId"), "senderId"),
        receiverId: parsePositiveNumber(requireField(input.receiverId, "receiverId"), "receiverId"),
        balances,
        creditorName: input.creditorName,
        debtorName: input.debtorName,
      }),
    );
  });
}
