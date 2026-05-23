import type { Command } from "./types.js";
import { run } from "../output.js";
import { getExchangeRate } from "@bananasplitz/api-ops";

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
    execute: (opts, trpc) =>
      run("get-exchange-rate", async () =>
        getExchangeRate(trpc, {
          baseCurrency: opts["base-currency"] as string | undefined,
          targetCurrency: opts["target-currency"] as string | undefined,
        })
      ),
  },
];
