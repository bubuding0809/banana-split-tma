import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { createSnapshot, parseNumber, requireField } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
  /** User creating the snapshot */
  creatorId: string;
  /** Snapshot title */
  title: string;
  /** Comma-separated expense UUIDs */
  expenseIds: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => ({
  message: `Create snapshot "${input.title}" with ${input.expenseIds.split(",").length} expense(s)?`,
});

/** Create an expense snapshot. */
export default async function tool(input: Input) {
  return withToolErrors("create-snapshot", input, async () => {
    return runTool("create-snapshot", input, (trpc) =>
      createSnapshot(trpc, {
        chatId: input.chatId,
        creatorId: parseNumber(requireField(input.creatorId, "creatorId"), "creatorId"),
        title: requireField(input.title, "title"),
        expenseIds: requireField(input.expenseIds, "expenseIds")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    );
  });
}
