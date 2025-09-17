import { createTRPCRouter } from "../../trpc.js";
import getCurrentRate from "./getCurrentRate.js";
import getMultipleRates from "./getMultipleRates.js";
import refreshRates from "./refreshRates.js";
import getSupportedCurrencies from "./getSupportedCurrencies.js";
import getCurrenciesWithBalance from "./getCurrenciesWithBalance.js";

export const currencyRouter = createTRPCRouter({
  getCurrentRate,
  getMultipleRates,
  refreshRates,
  getSupportedCurrencies,
  getCurrenciesWithBalance,
});
