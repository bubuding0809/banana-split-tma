import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { getSimplifiedDebts, requireField } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
  /** 3-letter currency code — required */
  currency: string;
};

/** Get simplified debt graph for a chat in one currency. */
export default async function tool(input: Input) {
  return withToolErrors("get-simplified-debts", input, async () => {
    return runTool("get-simplified-debts", input, (trpc) =>
      getSimplifiedDebts(trpc, {
        chatId: input.chatId,
        currency: requireField(input.currency, "currency"),
      }),
    );
  });
}
