import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { requireField, updateSnapshot } from "@bananasplitz/api-ops";

type Input = {
  snapshotId: string;
  chatId?: string;
  title: string;
  /** Comma-separated expense UUIDs */
  expenseIds: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Update snapshot ${input.snapshotId}?`,
});

/** Update a snapshot's title and expense list. */
export default async function tool(input: Input) {
  return withToolErrors("update-snapshot", input, async () => {
    return runTool("update-snapshot", input, (trpc) =>
      updateSnapshot(trpc, {
        snapshotId: requireField(input.snapshotId, "snapshotId"),
        chatId: input.chatId,
        title: requireField(input.title, "title"),
        expenseIds: requireField(input.expenseIds, "expenseIds")
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
      }),
    );
  });
}
