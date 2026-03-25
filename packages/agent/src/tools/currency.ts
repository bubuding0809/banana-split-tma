import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTrpcCaller } from "../trpc.js";

export const listCurrenciesTool = createTool({
  id: "listCurrenciesTool",
  description: "List all supported currencies with their details.",
  inputSchema: z.object({}),
  execute: async (data, context) => {
    const { caller } = createTrpcCaller(context);
    // Note: The instruction specifies listCurrencies but the router exposes getSupportedCurrencies
    const result = await caller.currency.getSupportedCurrencies({
      includeRates: true,
      onlyWithRates: false,
    });
    return JSON.stringify(result);
  },
});
