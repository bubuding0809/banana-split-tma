import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { parseBooleanField, updateChatSettings } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
  debtSimplification?: string;
  baseCurrency?: string;
  notifyOnExpense?: string;
  notifyOnExpenseUpdate?: string;
  notifyOnSettlement?: string;
};

export const confirmation: Tool.Confirmation<Input> = async () => ({
  message: "Update chat settings?",
});

/** Update chat settings (simplification, currency, notifications). */
export default async function tool(input: Input) {
  return withToolErrors("update-chat-settings", input, async () => {
    return runTool("update-chat-settings", input, (trpc) =>
      updateChatSettings(trpc, {
        chatId: input.chatId,
        debtSimplificationEnabled:
          input.debtSimplification !== undefined
            ? parseBooleanField(input.debtSimplification, "debtSimplification")
            : undefined,
        baseCurrency: input.baseCurrency,
        notifyOnExpense:
          input.notifyOnExpense !== undefined ? parseBooleanField(input.notifyOnExpense, "notifyOnExpense") : undefined,
        notifyOnExpenseUpdate:
          input.notifyOnExpenseUpdate !== undefined
            ? parseBooleanField(input.notifyOnExpenseUpdate, "notifyOnExpenseUpdate")
            : undefined,
        notifyOnSettlement:
          input.notifyOnSettlement !== undefined
            ? parseBooleanField(input.notifyOnSettlement, "notifyOnSettlement")
            : undefined,
      }),
    );
  });
}
