import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { getDebts, parseCurrencies } from "@bananasplitz/api-ops";

type Input = {
  chatId?: string;
  /** Comma-separated currency codes */
  currencies?: string;
};

/** Get all outstanding debts in a chat. */
export default async function tool(input: Input) {
  return withToolErrors("get-debts", input, async () => {
    return runTool("get-debts", input, (trpc) =>
      getDebts(trpc, {
        chatId: input.chatId,
        currencies: parseCurrencies(input.currencies),
      }),
    );
  });
}
