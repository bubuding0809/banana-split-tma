import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { bulkUpdateExpenses, parseJsonArray, requireField, type BulkUpdateRow } from "@bananasplitz/api-ops";

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
    const rows = parseJsonArray<BulkUpdateRow>(requireField(input.json, "json"), "json");
    const notify = input.notify === "true";

    return runTool("bulk-update-expenses", input, (trpc) =>
      bulkUpdateExpenses(trpc, {
        chatId: input.chatId,
        rows,
        notify,
      }),
    );
  });
}
