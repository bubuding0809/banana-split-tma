import { runTool, withToolErrors } from "../lib/tools/run-tool";

type Input = {
  /** ISO 4217 base currency (defaults to stored baseCurrency) */
  base?: string;
};

/** Per-counterparty balance totals across all groups in one base currency. */
export default async function tool(input: Input) {
  return withToolErrors("list-counterparty-balances", input, async () => {
    return runTool("list-counterparty-balances", input, (trpc) =>
      trpc.expenseShare.getMyCounterpartyBalances.query(input.base ? { baseCurrency: input.base } : {}),
    );
  });
}
