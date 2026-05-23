import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { getExchangeRate, requireField } from "@bananasplitz/api-ops";

type Input = {
  baseCurrency: string;
  targetCurrency: string;
};

/** Get current exchange rate between two currencies. */
export default async function tool(input: Input) {
  return withToolErrors("get-exchange-rate", input, async () => {
    return runTool("get-exchange-rate", input, (trpc) =>
      getExchangeRate(trpc, {
        baseCurrency: requireField(input.baseCurrency, "baseCurrency"),
        targetCurrency: requireField(input.targetCurrency, "targetCurrency"),
      }),
    );
  });
}
