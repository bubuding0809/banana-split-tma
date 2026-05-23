import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { listCounterpartyBalances } from "@bananasplitz/api-ops";

type Input = {
  /** ISO 4217 base currency */
  base?: string;
};

/** Per-counterparty balance totals across all groups. */
export default async function tool(input: Input) {
  return withToolErrors("list-counterparty-balances", input, async () => {
    return runTool("list-counterparty-balances", input, (trpc) =>
      listCounterpartyBalances(trpc, { baseCurrency: input.base }),
    );
  });
}
