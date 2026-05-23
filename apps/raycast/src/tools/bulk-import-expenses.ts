import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { bulkImportExpenses, parseJsonArray, requireField, type ExpenseRow } from "@bananasplitz/api-ops";

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

    return runTool("bulk-import-expenses", input, (trpc) =>
      bulkImportExpenses(trpc, {
        chatId: input.chatId,
        rows,
        notify,
      }),
    );
  });
}
