import type { TrpcClient } from "@bananasplitz/api-client";
import { missingField } from "../errors.js";

export async function getExchangeRate(
  trpc: TrpcClient,
  input: { baseCurrency?: string; targetCurrency?: string }
) {
  if (!input.baseCurrency) {
    missingField("--base-currency is required");
  }
  if (!input.targetCurrency) {
    missingField("--target-currency is required");
  }
  return trpc.currency.getCurrentRate.query({
    baseCurrency: String(input.baseCurrency),
    targetCurrency: String(input.targetCurrency),
  });
}
