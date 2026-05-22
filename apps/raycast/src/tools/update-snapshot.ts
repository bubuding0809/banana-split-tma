import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { requireField } from "../lib/tools/parse";

type Input = {
  /** Snapshot UUID */
  snapshotId: string;
  chatId?: string;
  /** New title */
  title: string;
  /** Comma-separated expense UUIDs */
  expenseIds: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Update snapshot ${input.snapshotId} to "${input.title}"?`,
});

/** Update snapshot title and expense membership. */
export default async function tool(input: Input) {
  return withToolErrors("update-snapshot", input, async () => {
    const snapshotId = requireField(input.snapshotId, "snapshotId");
    const title = requireField(input.title, "title");
    const expenseIds = requireField(input.expenseIds, "expenseIds")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return runTool("update-snapshot", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return trpc.snapshot.update.mutate({ snapshotId, chatId, title, expenseIds });
    });
  });
}
