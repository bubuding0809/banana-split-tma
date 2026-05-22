import { Tool } from "@raycast/api";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";
import { parseNumber, requireField } from "../lib/tools/parse";

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
    const creatorId = parseNumber(requireField(input.creatorId, "creatorId"), "creatorId");
    const title = requireField(input.title, "title");
    const expenseIds = requireField(input.expenseIds, "expenseIds")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return runTool("create-snapshot", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);
      return trpc.snapshot.create.mutate({ chatId, creatorId, title, expenseIds });
    });
  });
}
