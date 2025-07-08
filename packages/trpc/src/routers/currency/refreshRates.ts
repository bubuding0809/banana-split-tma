import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { fetchExchangeRates } from "../../utils/currencyApi.js";

export const inputSchema = z.object({
  baseCurrency: z.string().min(3).max(3).toUpperCase().default("USD"),
});

export const outputSchema = z.object({
  baseCurrency: z.string(),
  ratesUpdated: z.number(),
  lastUpdated: z.date(),
  rates: z.array(
    z.object({
      targetCurrency: z.string(),
      rate: z.number(),
    })
  ),
});

export const refreshRatesHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    const { baseCurrency } = input;

    // Fetch latest rates from API
    const apiResponse = await fetchExchangeRates(baseCurrency);

    if (!apiResponse.success) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "Failed to fetch exchange rates from external API",
      });
    }

    // Process all available rates from API
    const ratesToUpdate = Object.entries(apiResponse.rates);

    // Update rates in database using transaction for atomicity
    const updatedRates = await db.$transaction(async (tx) => {
      const updatePromises = ratesToUpdate.map(([targetCurrency, rate]) =>
        tx.currencyRate.upsert({
          where: {
            baseCurrency_targetCurrency: {
              baseCurrency,
              targetCurrency,
            },
          },
          update: {
            rate: rate,
            updatedAt: new Date(),
          },
          create: {
            baseCurrency,
            targetCurrency,
            rate: rate,
          },
        })
      );

      return Promise.all(updatePromises);
    });

    return {
      baseCurrency,
      ratesUpdated: updatedRates.length,
      lastUpdated: new Date(),
      rates: updatedRates.map((rate) => ({
        targetCurrency: rate.targetCurrency,
        rate: Number(rate.rate),
      })),
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to refresh exchange rates: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/currency/refresh",
      tags: ["currency"],
      summary: "Refresh exchange rates",
      description:
        "Fetch and cache all available exchange rates from external API for the specified base currency",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return refreshRatesHandler(input, ctx.db);
  });
