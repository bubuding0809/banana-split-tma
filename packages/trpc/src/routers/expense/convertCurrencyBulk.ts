import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { toNumber } from "../../utils/financial.js";
import { getCurrentRateHandler } from "../currency/getCurrentRate.js";
import { Decimal } from "decimal.js";

export const inputSchema = z.object({
  chatId: z.number(),
  fromCurrency: z.string().min(3).max(3).toUpperCase(),
  toCurrency: z.string().min(3).max(3).toUpperCase(),
  userId: z.number(),
});

export const outputSchema = z.object({
  convertedExpenses: z.number(),
  convertedSettlements: z.number(),
  totalExpensesAmount: z.number(),
  totalSettlementsAmount: z.number(),
});

export const convertCurrencyBulkHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    const { chatId, fromCurrency, toCurrency, userId } = input;

    // Validate chat exists and user has access
    const chat = await db.chat.findFirst({
      where: {
        id: chatId,
        members: {
          some: {
            id: userId,
          },
        },
      },
    });

    if (!chat) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Chat not found or you don't have access",
      });
    }

    // Return early if converting to same currency
    if (fromCurrency === toCurrency) {
      return {
        convertedExpenses: 0,
        convertedSettlements: 0,
        totalExpensesAmount: 0,
        totalSettlementsAmount: 0,
      };
    }

    // Get current exchange rate
    const exchangeRate = await getCurrentRateHandler(
      {
        baseCurrency: fromCurrency,
        targetCurrency: toCurrency,
        fallbackBaseCurrency: "USD",
        autoRefresh: true,
      },
      db
    );

    const rate = new Decimal(exchangeRate.rate);

    // Get all expenses to convert
    const expensesToConvert = await db.expense.findMany({
      where: {
        chatId,
        currency: fromCurrency,
      },
      include: {
        shares: true,
      },
    });

    // Get all settlements to convert
    const settlementsToConvert = await db.settlement.findMany({
      where: {
        chatId,
        currency: fromCurrency,
      },
    });

    let totalExpensesAmount = 0;
    let totalSettlementsAmount = 0;

    // Perform conversion in a transaction
    await db.$transaction(async (tx) => {
      // Convert expenses
      for (const expense of expensesToConvert) {
        const originalAmount = new Decimal(expense.amount.toString());
        const convertedAmount = originalAmount.mul(rate);
        totalExpensesAmount += toNumber(originalAmount);

        // Update expense
        await tx.expense.update({
          where: { id: expense.id },
          data: {
            amount: convertedAmount,
            currency: toCurrency,
          },
        });

        // Update expense shares if they exist
        if (expense.shares.length > 0) {
          for (const share of expense.shares) {
            if (share.amount) {
              const originalShareAmount = new Decimal(share.amount.toString());
              const convertedShareAmount = originalShareAmount.mul(rate);

              await tx.expenseShare.update({
                where: {
                  expenseId_userId: {
                    expenseId: share.expenseId,
                    userId: share.userId,
                  },
                },
                data: {
                  amount: convertedShareAmount,
                },
              });
            }
          }
        }
      }

      // Convert settlements
      for (const settlement of settlementsToConvert) {
        const originalAmount = new Decimal(settlement.amount.toString());
        const convertedAmount = originalAmount.mul(rate);
        totalSettlementsAmount += toNumber(originalAmount);

        await tx.settlement.update({
          where: { id: settlement.id },
          data: {
            amount: convertedAmount,
            currency: toCurrency,
          },
        });
      }
    });

    return {
      convertedExpenses: expensesToConvert.length,
      convertedSettlements: settlementsToConvert.length,
      totalExpensesAmount,
      totalSettlementsAmount,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to convert currency for transactions",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/expense/convert-currency-bulk",
      tags: ["expense"],
      summary:
        "Convert all expenses and settlements from one currency to another",
      description:
        "Bulk convert all expenses and settlements in a chat from one currency to another using current exchange rates",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return convertCurrencyBulkHandler(input, ctx.db);
  });
