import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { toNumber } from "../../utils/financial.js";
import { refreshRatesHandler } from "./refreshRates.js";
import { isCacheExpired } from "../../utils/currencyApi.js";

/**
 * Helper function to calculate cross-currency rate via a base currency
 * @param baseCurrency - Source currency
 * @param targetCurrency - Target currency
 * @param fallbackBaseCurrency - Base currency to use for cross-calculation (usually USD)
 * @param db - Database instance
 * @returns Rate and last updated date, or null if calculation not possible
 */
async function calculateCrossRate(
  baseCurrency: string,
  targetCurrency: string,
  fallbackBaseCurrency: string,
  db: Db
): Promise<{ rate: number; lastUpdated: Date } | null> {
  // Get both rates from fallback base currency
  const [baseToFallback, fallbackToTarget] = await Promise.all([
    db.currencyRate.findUnique({
      where: {
        baseCurrency_targetCurrency: {
          baseCurrency: fallbackBaseCurrency,
          targetCurrency: baseCurrency,
        },
      },
    }),
    db.currencyRate.findUnique({
      where: {
        baseCurrency_targetCurrency: {
          baseCurrency: fallbackBaseCurrency,
          targetCurrency: targetCurrency,
        },
      },
    }),
  ]);

  if (!baseToFallback || !fallbackToTarget) {
    return null;
  }

  // Check if either rate is expired
  if (
    isCacheExpired(baseToFallback.updatedAt) ||
    isCacheExpired(fallbackToTarget.updatedAt)
  ) {
    return null;
  }

  // Calculate cross rate: (fallback->target) / (fallback->base)
  const baseToFallbackRate = toNumber(baseToFallback.rate);
  const fallbackToTargetRate = toNumber(fallbackToTarget.rate);
  const crossRate = fallbackToTargetRate / baseToFallbackRate;

  // Use the older of the two rates for last updated
  const lastUpdated =
    baseToFallback.updatedAt < fallbackToTarget.updatedAt
      ? baseToFallback.updatedAt
      : fallbackToTarget.updatedAt;

  return {
    rate: crossRate,
    lastUpdated,
  };
}

export const inputSchema = z.object({
  baseCurrency: z.string().min(3).max(3).toUpperCase(),
  targetCurrency: z.string().min(3).max(3).toUpperCase(),
  fallbackBaseCurrency: z.string().min(3).max(3).toUpperCase().default("USD"),
  autoRefresh: z.boolean().default(true),
});

export const outputSchema = z.object({
  baseCurrency: z.string(),
  targetCurrency: z.string(),
  rate: z.number(),
  lastUpdated: z.date(),
  calculationMethod: z.enum(["direct", "cross", "refreshed"]),
});

export const getCurrentRateHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    const { baseCurrency, targetCurrency, fallbackBaseCurrency, autoRefresh } =
      input;

    // Return 1.0 if both currencies are the same
    if (baseCurrency === targetCurrency) {
      return {
        baseCurrency,
        targetCurrency,
        rate: 1.0,
        lastUpdated: new Date(),
        calculationMethod: "direct" as const,
      };
    }

    // TIER 1: Look for direct cached rate
    const cachedRate = await db.currencyRate.findUnique({
      where: {
        baseCurrency_targetCurrency: {
          baseCurrency,
          targetCurrency,
        },
      },
    });

    if (cachedRate && !isCacheExpired(cachedRate.updatedAt)) {
      return {
        baseCurrency: cachedRate.baseCurrency,
        targetCurrency: cachedRate.targetCurrency,
        rate: toNumber(cachedRate.rate),
        lastUpdated: cachedRate.updatedAt,
        calculationMethod: "direct" as const,
      };
    }

    // TIER 2: Try cross-currency calculation via fallback base currency
    const crossRate = await calculateCrossRate(
      baseCurrency,
      targetCurrency,
      fallbackBaseCurrency,
      db
    );

    if (crossRate) {
      return {
        baseCurrency,
        targetCurrency,
        rate: crossRate.rate,
        lastUpdated: crossRate.lastUpdated,
        calculationMethod: "cross" as const,
      };
    }

    // TIER 3: Auto-refresh rates if enabled
    if (autoRefresh) {
      try {
        // Refresh rates with the fallback base currency
        await refreshRatesHandler({ baseCurrency: fallbackBaseCurrency }, db);

        // Retry direct lookup first
        const refreshedDirectRate = await db.currencyRate.findUnique({
          where: {
            baseCurrency_targetCurrency: {
              baseCurrency,
              targetCurrency,
            },
          },
        });

        if (
          refreshedDirectRate &&
          !isCacheExpired(refreshedDirectRate.updatedAt)
        ) {
          return {
            baseCurrency: refreshedDirectRate.baseCurrency,
            targetCurrency: refreshedDirectRate.targetCurrency,
            rate: toNumber(refreshedDirectRate.rate),
            lastUpdated: refreshedDirectRate.updatedAt,
            calculationMethod: "refreshed" as const,
          };
        }

        // Retry cross-currency calculation after refresh
        const refreshedCrossRate = await calculateCrossRate(
          baseCurrency,
          targetCurrency,
          fallbackBaseCurrency,
          db
        );

        if (refreshedCrossRate) {
          return {
            baseCurrency,
            targetCurrency,
            rate: refreshedCrossRate.rate,
            lastUpdated: refreshedCrossRate.lastUpdated,
            calculationMethod: "refreshed" as const,
          };
        }
      } catch (refreshError) {
        // Log refresh error but continue to throw main error
        console.error("Auto-refresh failed:", refreshError);
      }
    }

    // All fallback methods failed
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Exchange rate not found for ${baseCurrency} to ${targetCurrency}. Unable to calculate via ${fallbackBaseCurrency} or refresh rates.`,
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to get current exchange rate",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/currency/rate",
      tags: ["currency"],
      summary: "Get current exchange rate",
      description:
        "Get the current exchange rate between two currencies with intelligent fallback via USD and auto-refresh",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    return getCurrentRateHandler(input, ctx.db);
  });
