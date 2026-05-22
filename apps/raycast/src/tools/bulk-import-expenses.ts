import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { parseJsonArray, requireField } from "../lib/tools/parse";

type ExpenseRow = {
  payerId: number;
  creatorId?: number;
  description: string;
  amount: number;
  currency?: string;
  splitMode: "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";
  participantIds: number[];
  customSplits?: { userId: number; amount: number }[];
  date?: string;
  categoryId?: string | null;
};

type Input = {
  /** JSON array of expense objects (same shape as create-expense rows) */
  json: string;
  /** Numeric chat ID (optional if API key is chat-scoped) */
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
    message: `Import ${count} expense(s)? Per-row notifications are silent unless notify is true.`,
    info: [{ name: "Notify summary", value: input.notify ? "yes" : "no" }],
  };
};

/** Bulk import expenses from a JSON array. */
export default async function tool(input: Input) {
  return withToolErrors("bulk-import-expenses", input, async () => {
    const rows = parseJsonArray<ExpenseRow>(requireField(input.json, "json"), "json");
    const notify = input.notify === "true";

    return runTool("bulk-import-expenses", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);

      const bulkResult = await trpc.expense.createExpensesBulk.mutate({
        chatId,
        expenses: rows.map((row) => ({
          payerId: row.payerId,
          creatorId: row.creatorId,
          description: row.description,
          amount: row.amount,
          currency: row.currency,
          splitMode: row.splitMode,
          participantIds: row.participantIds,
          customSplits: row.customSplits,
          date: row.date ? new Date(row.date) : undefined,
          categoryId: row.categoryId,
        })),
      });

      let summary: { sent: boolean; messageId: number | null } | undefined;
      if (notify && bulkResult.succeeded > 0) {
        const items = bulkResult.results
          .filter((r) => r.status === "success" && "expense" in r && r.expense)
          .map((r) => {
            if (r.status !== "success" || !("expense" in r)) return null;
            const inputRow = rows[r.index];
            return {
              description: String(r.expense.description ?? r.description ?? ""),
              amount: Number(r.expense.amount),
              currency: String(r.expense.currency),
              categoryId: r.expense.categoryId ?? null,
              payerId: inputRow?.payerId,
              splitMode: inputRow?.splitMode,
              participantCount: inputRow?.participantIds?.length,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);
        try {
          summary = await trpc.expense.sendBatchExpenseSummary.mutate({
            chatId,
            kind: "created",
            items,
          });
        } catch {
          summary = { sent: false, messageId: null };
        }
      }

      return summary ? { ...bulkResult, summary } : bulkResult;
    });
  });
}
