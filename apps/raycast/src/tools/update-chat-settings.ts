import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
  /** Enable/disable debt simplification (true/false) */
  debtSimplification?: string;
  /** Default 3-letter currency code */
  baseCurrency?: string;
  /** Notify chat when an expense is added (true/false) */
  notifyOnExpense?: string;
  /** Notify chat when an expense is edited (true/false) */
  notifyOnExpenseUpdate?: string;
  /** Notify chat when a settlement is recorded (true/false) */
  notifyOnSettlement?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  const changes: { name: string; value: string }[] = [];
  if (input.debtSimplification !== undefined) {
    changes.push({ name: "Debt simplification", value: input.debtSimplification });
  }
  if (input.baseCurrency) changes.push({ name: "Base currency", value: input.baseCurrency });
  if (input.notifyOnExpense !== undefined) {
    changes.push({ name: "Notify on expense", value: input.notifyOnExpense });
  }
  if (input.notifyOnExpenseUpdate !== undefined) {
    changes.push({ name: "Notify on expense update", value: input.notifyOnExpenseUpdate });
  }
  if (input.notifyOnSettlement !== undefined) {
    changes.push({ name: "Notify on settlement", value: input.notifyOnSettlement });
  }
  return {
    message: "Update chat settings for this group?",
    info: changes.length ? changes : [{ name: "Chat", value: String(input.chatId ?? "scoped") }],
  };
};

/** Update chat settings (simplification, currency, notifications). */
export default async function tool(input: Input) {
  return withToolErrors("update-chat-settings", input, async () => {
    return runTool("update-chat-settings", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      const updateData: {
        chatId: number;
        debtSimplificationEnabled?: boolean;
        baseCurrency?: string;
        notifyOnExpense?: boolean;
        notifyOnExpenseUpdate?: boolean;
        notifyOnSettlement?: boolean;
      } = { chatId };

      if (input.debtSimplification !== undefined) {
        updateData.debtSimplificationEnabled = input.debtSimplification === "true";
      }
      if (input.baseCurrency !== undefined) updateData.baseCurrency = input.baseCurrency;
      if (input.notifyOnExpense !== undefined) {
        updateData.notifyOnExpense = input.notifyOnExpense === "true";
      }
      if (input.notifyOnExpenseUpdate !== undefined) {
        updateData.notifyOnExpenseUpdate = input.notifyOnExpenseUpdate === "true";
      }
      if (input.notifyOnSettlement !== undefined) {
        updateData.notifyOnSettlement = input.notifyOnSettlement === "true";
      }

      return trpc.chat.updateChat.mutate(updateData);
    });
  });
}
