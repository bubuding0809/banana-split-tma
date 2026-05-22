import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { parseNumber, parsePositiveNumber, requireField } from "../lib/tools/parse";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
  /** User paying the debt */
  senderId: string;
  /** User receiving payment */
  receiverId: string;
  /** Amount paid */
  amount: string;
  /** 3-letter currency (defaults to chat base) */
  currency?: string;
  /** Optional note */
  description?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Record settlement: user ${input.senderId} pays ${input.amount}${input.currency ? ` ${input.currency}` : ""} to user ${input.receiverId}? May notify the group.`,
  info: [
    { name: "From", value: String(input.senderId) },
    { name: "To", value: String(input.receiverId) },
    { name: "Amount", value: String(input.amount) },
  ],
});

/** Record a settlement between two users. */
export default async function tool(input: Input) {
  return withToolErrors("create-settlement", input, async () => {
    const senderId = parseNumber(requireField(input.senderId, "senderId"), "senderId");
    const receiverId = parseNumber(requireField(input.receiverId, "receiverId"), "receiverId");
    const amount = parsePositiveNumber(requireField(input.amount, "amount"), "amount");

    return runTool("create-settlement", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      const chat = await trpc.chat.getChat.query({ chatId });
      const members = chat.members ?? [];
      const creditor = members.find((m: { id: number }) => m.id === receiverId);
      const debtor = members.find((m: { id: number }) => m.id === senderId);

      return trpc.settlement.createSettlement.mutate({
        chatId,
        senderId,
        receiverId,
        amount,
        currency: input.currency,
        description: input.description,
        sendNotification: true,
        creditorName: creditor?.firstName ?? `User ${receiverId}`,
        creditorUsername: creditor?.username ?? undefined,
        debtorName: debtor?.firstName ?? `User ${senderId}`,
        threadId: chat.threadId ?? undefined,
      });
    });
  });
}
