import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { getTotals, requireField } from "@bananasplitz/api-ops";

type Input = {
  userId: string;
  chatId?: string;
};

/** Total borrowed and lent for a user in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("get-totals", input, async () => {
    return runTool("get-totals", input, (trpc) =>
      getTotals(trpc, {
        userId: requireField(input.userId, "userId"),
        chatId: input.chatId,
      }),
    );
  });
}
