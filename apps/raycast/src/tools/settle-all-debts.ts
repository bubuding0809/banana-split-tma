import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { parseJsonArray, parseNumber, requireField } from "../lib/tools/parse";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
  /** User paying */
  senderId: string;
  /** User receiving */
  receiverId: string;
  /** JSON array: [{"currency":"USD","amount":15}] */
  balances: string;
  creditorName?: string;
  debtorName?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Settle all debts between ${input.senderId} and ${input.receiverId} using the provided balances? May notify the group.`,
  info: [{ name: "Balances", value: input.balances }],
});

/** Settle all debts between two users (multi-currency). */
export default async function tool(input: Input) {
  return withToolErrors("settle-all-debts", input, async () => {
    const senderId = parseNumber(requireField(input.senderId, "senderId"), "senderId");
    const receiverId = parseNumber(requireField(input.receiverId, "receiverId"), "receiverId");
    const parsedBalances = parseJsonArray<{ currency: string; amount: number }>(
      requireField(input.balances, "balances"),
      "balances",
    );

    return runTool("settle-all-debts", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      const chat = await trpc.chat.getChat.query({ chatId });
      const members = chat.members ?? [];
      const creditor = members.find((m: { id: number }) => m.id === receiverId);
      const debtor = members.find((m: { id: number }) => m.id === senderId);

      return trpc.settlement.settleAllDebts.mutate({
        chatId,
        senderId,
        receiverId,
        balances: parsedBalances,
        creditorName: input.creditorName ?? creditor?.firstName ?? `User ${receiverId}`,
        creditorUsername: creditor?.username ?? undefined,
        debtorName: input.debtorName ?? debtor?.firstName ?? `User ${senderId}`,
        threadId: chat.threadId ?? undefined,
      });
    });
  });
}
