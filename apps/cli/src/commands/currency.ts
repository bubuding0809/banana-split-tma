import type { Command } from "./types.js";
import { run, error } from "../output.js";

export const currencyCommands: Command[] = [
  {
    name: "get-exchange-rate",
    description: "Get the current exchange rate between two currencies",
    agentGuidance:
      "Use this to check conversion rates before creating expenses in foreign currencies.",
    examples: [
      "banana get-exchange-rate --base-currency USD --target-currency SGD",
    ],
    options: {
      "base-currency": {
        type: "string",
        description: "The source currency code (e.g. USD)",
        required: true,
      },
      "target-currency": {
        type: "string",
        description: "The target currency code (e.g. SGD)",
        required: true,
      },
    },
    execute: (opts, trpc) => {
      if (!opts["base-currency"]) {
        return error(
          "missing_option",
          "--base-currency is required",
          "get-exchange-rate"
        );
      }
      if (!opts["target-currency"]) {
        return error(
          "missing_option",
          "--target-currency is required",
          "get-exchange-rate"
        );
      }
      return run("get-exchange-rate", async () => {
        return trpc.currency.getCurrentRate.query({
          baseCurrency: String(opts["base-currency"]),
          targetCurrency: String(opts["target-currency"]),
        });
      });
    },
  },
];
