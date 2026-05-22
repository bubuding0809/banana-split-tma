import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { parseJsonArray, requireField } from "../lib/tools/parse";
import type { ExpenseSplitMode } from "../lib/tools/expense-update";

type UpdateRow = {
  expenseId: string;
  payerId?: number;
  creatorId?: number;
  description?: string;
  amount?: number;
  currency?: string;
  splitMode?: ExpenseSplitMode;
  participantIds?: number[];
  customSplits?: { userId: number; amount: number }[];
  date?: string;
  category?: string | null;
};

type Input = {
  /** JSON array of partial updates (each needs expenseId) */
  json: string;
  chatId?: string;
  /** Send condensed Telegram summary after batch (true/false) */
  notify?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  let count = "?";
  try {
    const rows = JSON.parse(input.json) as unknown[];
    if (Array.isArray(rows)) count = String(rows.length);
  } catch {
    // ignore
  }
  return {
    message: `Update ${count} expense(s)? Per-row notifications suppressed unless notify is true.`,
    info: [{ name: "Notify summary", value: input.notify ? "yes" : "no" }],
  };
};

/** Bulk update expenses from a JSON array. */
export default async function tool(input: Input) {
  return withToolErrors("bulk-update-expenses", input, async () => {
    const rows = parseJsonArray<UpdateRow>(requireField(input.json, "json"), "json");
    const notify = input.notify === "true";

    return runTool("bulk-update-expenses", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);

      const expenses = rows.map((row, i) => {
        if (!row?.expenseId) throw new Error(`row ${i}: missing expenseId`);
        const out: Record<string, unknown> = { expenseId: row.expenseId };
        if (row.payerId !== undefined) out.payerId = row.payerId;
        if (row.creatorId !== undefined) out.creatorId = row.creatorId;
        if (row.description !== undefined) out.description = row.description;
        if (row.amount !== undefined) out.amount = row.amount;
        if (row.currency !== undefined) out.currency = row.currency;
        if (row.splitMode !== undefined) out.splitMode = row.splitMode;
        if (row.participantIds !== undefined) out.participantIds = row.participantIds;
        if (row.customSplits !== undefined) out.customSplits = row.customSplits;
        if (row.date !== undefined) {
          const d = new Date(row.date);
          if (Number.isNaN(d.getTime())) {
            throw new Error(`row ${i}: date must be valid ISO 8601`);
          }
          out.date = d;
        }
        if (row.category !== undefined) {
          out.categoryId = row.category === null || row.category === "none" ? null : row.category;
        }
        return out;
      });

      return trpc.expense.updateExpensesBulk.mutate({
        chatId,
        expenses: expenses as Parameters<typeof trpc.expense.updateExpensesBulk.mutate>[0]["expenses"],
        sendNotification: notify,
      });
    });
  });
}
