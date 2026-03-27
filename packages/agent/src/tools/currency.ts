import { serializeToolResult } from "../serialize.js";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTrpcCaller } from "../trpc.js";
import { withToolErrorHandling } from "../utils.js";

export const listCurrenciesTool = createTool({
  id: "listCurrenciesTool",
  description: "List all supported currencies with their details.",
  inputSchema: z.object({}),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller } = createTrpcCaller(context);
    // Note: The instruction specifies listCurrencies but the router exposes getSupportedCurrencies
    const result = await caller.currency.getSupportedCurrencies({
      includeRates: true,
      onlyWithRates: false,
    });
    return serializeToolResult(result);
  }),
});

export const getExchangeRateTool = createTool({
  id: "getExchangeRateTool",
  description: "Get the current exchange rate between two currencies.",
  inputSchema: z.object({
    baseCurrency: z.string().describe("The source currency code (e.g. USD)"),
    targetCurrency: z.string().describe("The target currency code (e.g. SGD)"),
  }),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller } = createTrpcCaller(context);
    const result = await caller.currency.getCurrentRate({
      baseCurrency: data.baseCurrency,
      targetCurrency: data.targetCurrency,
    });
    return serializeToolResult(result);
  }),
});
