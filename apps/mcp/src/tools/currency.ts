import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TrpcClient } from "../client.js";
import { toolHandler } from "./utils.js";

export function registerCurrencyTools(server: McpServer, trpc: TrpcClient) {
  server.registerTool(
    "banana_get_exchange_rate",
    {
      title: "Get Exchange Rate",
      description:
        "Get the current exchange rate between two currencies. " +
        "Uses a 3-tier fallback: direct rate, cross-rate via USD, or refreshed rate.",
      inputSchema: {
        base_currency: z
          .string()
          .length(3)
          .describe("The source currency code (e.g. 'USD')."),
        target_currency: z
          .string()
          .length(3)
          .describe("The target currency code (e.g. 'SGD')."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    toolHandler(
      "banana_get_exchange_rate",
      async ({ base_currency, target_currency }) => {
        const result = await trpc.currency.getCurrentRate.query({
          baseCurrency: base_currency,
          targetCurrency: target_currency,
        });
        const text =
          `**Exchange Rate:**\n` +
          `1 ${result.baseCurrency} = ${result.rate} ${result.targetCurrency}\n` +
          `Method: ${result.calculationMethod}\n` +
          `Last Updated: ${new Date(result.lastUpdated).toLocaleString()}`;
        return {
          content: [{ type: "text" as const, text }],
        };
      }
    )
  );
}
