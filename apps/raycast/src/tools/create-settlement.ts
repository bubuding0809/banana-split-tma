import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { createSettlement, parsePositiveNumber, requireField } from "@bananasplitz/api-ops";

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
  message: `Record settlement of ${input.amount}${input.currency ? ` ${input.currency}` : ""} from user ${input.senderId} to ${input.receiverId}? May notify the group.`,
});

/** Record a debt settlement between two users. */
export default async function tool(input: Input) {
  return withToolErrors("create-settlement", input, async () => {
    return runTool("create-settlement", input, (trpc) =>
      createSettlement(trpc, {
        chatId: input.chatId,
        senderId: parsePositiveNumber(requireField(input.senderId, "senderId"), "senderId"),
        receiverId: parsePositiveNumber(requireField(input.receiverId, "receiverId"), "receiverId"),
        amount: parsePositiveNumber(requireField(input.amount, "amount"), "amount"),
        currency: input.currency,
        description: input.description,
      }),
    );
  });
}
