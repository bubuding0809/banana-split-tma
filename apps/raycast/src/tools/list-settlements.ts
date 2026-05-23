import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { listSettlements } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
  currency?: string;
};

/** List settlements in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("list-settlements", input, async () => {
    return runTool("list-settlements", input, (trpc) =>
      listSettlements(trpc, {
        chatId: input.chatId,
        currency: input.currency,
      }),
    );
  });
}
