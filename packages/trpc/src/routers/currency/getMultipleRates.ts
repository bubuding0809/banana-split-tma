import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { getCurrentRateHandler } from "./getCurrentRate.js";

export const inputSchema = z.object({
  baseCurrency: z.string().min(3).max(3).toUpperCase(),
  targetCurrencies: z.array(z.string().min(3).max(3).toUpperCase()),
  fallbackBaseCurrency: z.string().min(3).max(3).toUpperCase().default("USD"),
  autoRefresh: z.boolean().default(true),
});

export const outputSchema = z.object({
  baseCurrency: z.string(),
  rates: z.record(
    z.string(),
    z.object({
      rate: z.number(),
      lastUpdated: z.date(),
      calculationMethod: z.enum(["direct", "cross", "refreshed"]),
    })
  ),
});

export const getMultipleRatesHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    const {
      baseCurrency,
      targetCurrencies,
      fallbackBaseCurrency,
      autoRefresh,
    } = input;

    // Remove duplicates and filter out base currency
    const uniqueTargetCurrencies = [...new Set(targetCurrencies)].filter(
      (currency) => currency !== baseCurrency
    );

    const rates: Record<
      string,
      {
        rate: number;
        lastUpdated: Date;
        calculationMethod: "direct" | "cross" | "refreshed";
      }
    > = {};

    // Get rates for each target currency
    await Promise.all(
      uniqueTargetCurrencies.map(async (targetCurrency) => {
        try {
          const rateResult = await getCurrentRateHandler(
            {
              baseCurrency,
              targetCurrency,
              fallbackBaseCurrency,
              autoRefresh,
            },
            db
          );

          rates[targetCurrency] = {
            rate: rateResult.rate,
            lastUpdated: rateResult.lastUpdated,
            calculationMethod: rateResult.calculationMethod,
          };
        } catch (error) {
          // Log error but don't fail the entire request
          console.warn(
            `Failed to get rate for ${baseCurrency} to ${targetCurrency}:`,
            error
          );
          // Skip this currency - don't add to rates object
        }
      })
    );

    return {
      baseCurrency,
      rates,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to get multiple currency rates",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/currency/multiple-rates",
      tags: ["currency"],
      summary: "Get multiple currency exchange rates",
      description:
        "Get exchange rates for multiple target currencies against a base currency with intelligent fallback and auto-refresh",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    return getMultipleRatesHandler(input, ctx.db);
  });
