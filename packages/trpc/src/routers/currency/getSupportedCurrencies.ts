import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, publicProcedure } from "../../trpc.js";
import { getAllCurrencies } from "../../utils/currencyApi.js";

export const inputSchema = z.object({
  includeRates: z.boolean().default(false),
  onlyWithRates: z.boolean().default(false),
});

export const outputSchema = z.object({
  currencies: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      symbol: z.string(),
      symbol_native: z.string(),
      name_plural: z.string(),
      decimal_digits: z.number(),
      hasRate: z.boolean().optional(),
      lastUpdated: z.date().optional(),
    })
  ),
});

export const getSupportedCurrenciesHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    const { includeRates, onlyWithRates } = input;

    let ratesMap: Map<string, { hasRate: boolean; lastUpdated: Date }> =
      new Map();

    if (includeRates || onlyWithRates) {
      // Fetch available rates from database
      const availableRates = await db.currencyRate.findMany({
        where: {
          baseCurrency: "USD", // USD as base currency
        },
        select: {
          targetCurrency: true,
          updatedAt: true,
        },
      });

      ratesMap = new Map(
        availableRates.map((rate) => [
          rate.targetCurrency,
          { hasRate: true, lastUpdated: rate.updatedAt },
        ])
      );
    }

    // Get all currencies from comprehensive database
    let allCurrencies = getAllCurrencies();

    // Filter to only currencies with rates if requested
    if (onlyWithRates) {
      allCurrencies = allCurrencies.filter((currency) =>
        ratesMap.has(currency.code)
      );
    }

    const currencies = allCurrencies.map((currency) => ({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      symbol_native: currency.symbol_native,
      name_plural: currency.name_plural,
      decimal_digits: currency.decimal_digits,
      ...(includeRates && {
        hasRate: ratesMap.has(currency.code),
        lastUpdated: ratesMap.get(currency.code)?.lastUpdated,
      }),
    }));

    return {
      currencies,
    };
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to get supported currencies",
    });
  }
};

export default publicProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/currency/supported",
      tags: ["currency"],
      summary: "Get supported currencies",
      description:
        "Get comprehensive list of supported currencies with rich metadata and optional rate availability",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    return getSupportedCurrenciesHandler(input, ctx.db);
  });
