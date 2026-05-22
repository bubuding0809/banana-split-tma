import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { requireField } from "../lib/tools/parse";

type Input = {
  /** Source ISO 4217 currency code */
  baseCurrency: string;
  /** Target ISO 4217 currency code */
  targetCurrency: string;
};

/** Current exchange rate between two currencies. */
export default async function tool(input: Input) {
  return withToolErrors("get-exchange-rate", input, async () => {
    const baseCurrency = requireField(input.baseCurrency, "baseCurrency");
    const targetCurrency = requireField(input.targetCurrency, "targetCurrency");
    return runTool("get-exchange-rate", input, (trpc) =>
      trpc.currency.getCurrentRate.query({ baseCurrency, targetCurrency }),
    );
  });
}
