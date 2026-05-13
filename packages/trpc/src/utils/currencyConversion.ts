import { getExchangeRate } from "./currencyApi.js";

/**
 * Convert a native amount to a base currency using a USD-pivot rates record.
 * `rates` should be a fxratesapi.com style record with `base = USD` (the
 * shape returned by `currency.getMultipleRates` when its baseCurrency = USD).
 *
 * Returns `null` if either currency is missing from `rates`.
 */
export function convertNativeToBase(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number | null {
  if (fromCurrency === toCurrency) return amount;
  const rate = getExchangeRate(rates, fromCurrency, toCurrency);
  if (rate === null) return null;
  return amount * rate;
}
