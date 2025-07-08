import { createTRPCRouter } from "../../trpc.js";
import getCurrentRate from "./getCurrentRate.js";
import refreshRates from "./refreshRates.js";
import getSupportedCurrencies from "./getSupportedCurrencies.js";

export const currencyRouter = createTRPCRouter({
  getCurrentRate,
  refreshRates,
  getSupportedCurrencies,
});
