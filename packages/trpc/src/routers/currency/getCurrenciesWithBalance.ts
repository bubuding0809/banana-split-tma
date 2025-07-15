import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import {
  isSignificantBalance,
  sumAmounts,
  toNumber,
} from "../../utils/financial.js";
import { getCurrencyInfo } from "../../utils/currencyApi.js";

export const inputSchema = z.object({
  userId: z.number().transform((val) => BigInt(val)),
  chatId: z.number().transform((val) => BigInt(val)),
});

export const outputSchema = z.array(
  z.object({
    code: z.string(),
    name: z.string(),
    symbol: z.string(),
    symbol_native: z.string(),
    name_plural: z.string(),
    decimal_digits: z.number(),
    totalBalance: z.number(),
    memberCount: z.number(),
  })
);

export const getCurrenciesWithBalanceHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    // Get all unique currencies used in this chat from expenses and settlements
    const [expenseCurrencies, settlementCurrencies] = await Promise.all([
      db.expense.findMany({
        where: { chatId: input.chatId },
        select: { currency: true },
        distinct: ["currency"],
      }),
      db.settlement.findMany({
        where: { chatId: input.chatId },
        select: { currency: true },
        distinct: ["currency"],
      }),
    ]);

    // Combine and deduplicate currencies
    const allUsedCurrencies = [
      ...new Set([
        ...expenseCurrencies.map((e) => e.currency),
        ...settlementCurrencies.map((s) => s.currency),
      ]),
    ];

    if (allUsedCurrencies.length === 0) {
      return [];
    }

    // Get chat members to calculate balances across all members
    const chatMembers = await db.chat.findFirst({
      where: { id: input.chatId },
      select: {
        members: {
          select: { id: true },
        },
      },
    });

    if (!chatMembers) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Chat not found",
      });
    }

    const memberIds = chatMembers.members.map((m) => m.id);

    // Calculate total balance for each currency
    const currenciesWithBalances = await Promise.all(
      allUsedCurrencies.map(async (currency) => {
        // Calculate total balance across all members for this currency
        let totalBalance = 0;
        let memberCount = 0;

        for (const memberId of memberIds) {
          // Calculate net balance for this member in this currency
          const memberBalance = await calculateMemberBalance(
            db,
            input.chatId,
            memberId,
            currency
          );

          if (isSignificantBalance(memberBalance)) {
            totalBalance += Math.abs(memberBalance);
            memberCount++;
          }
        }

        return {
          currency,
          totalBalance,
          memberCount,
        };
      })
    );

    // Filter currencies with significant balances
    const significantCurrencies = currenciesWithBalances.filter(
      ({ totalBalance }) => isSignificantBalance(totalBalance)
    );

    // Combine balance data with currency metadata
    const result = significantCurrencies
      .map(({ currency, totalBalance, memberCount }) => {
        const currencyData = getCurrencyInfo(currency);
        if (!currencyData) {
          // Fallback for unknown currencies
          return {
            code: currency,
            name: currency,
            symbol: currency,
            symbol_native: currency,
            name_plural: currency,
            decimal_digits: 2,
            totalBalance,
            memberCount,
          };
        }

        return {
          code: currencyData.code,
          name: currencyData.name,
          symbol: currencyData.symbol,
          symbol_native: currencyData.symbol_native,
          name_plural: currencyData.name_plural,
          decimal_digits: currencyData.decimal_digits,
          totalBalance,
          memberCount,
        };
      })
      .sort((a, b) => b.totalBalance - a.totalBalance); // Sort by total balance descending

    return result;
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to get currencies with balance",
    });
  }
};

/**
 * Calculate the net balance for a specific member in a specific currency
 * This replicates the logic from getNetShareHandler but for a single member
 */
async function calculateMemberBalance(
  db: Db,
  chatId: bigint,
  memberId: bigint,
  currency: string
): Promise<number> {
  // Amount this member should receive (others owe them)
  const toReceive = await db.expenseShare.findMany({
    where: {
      expense: {
        chatId: chatId,
        payerId: memberId,
        currency: currency,
      },
      userId: { not: memberId }, // Exclude self
    },
    select: { amount: true },
  });

  // Amount this member owes to others
  const toPay = await db.expenseShare.findMany({
    where: {
      expense: {
        chatId: chatId,
        payerId: { not: memberId }, // Exclude self
        currency: currency,
      },
      userId: memberId,
    },
    select: { amount: true },
  });

  // Settlements this member sent (reduces their debt)
  const settlementsSent = await db.settlement.findMany({
    where: {
      chatId: chatId,
      senderId: memberId,
      currency: currency,
    },
    select: { amount: true },
  });

  // Settlements this member received (increases their debt)
  const settlementsReceived = await db.settlement.findMany({
    where: {
      chatId: chatId,
      receiverId: memberId,
      currency: currency,
    },
    select: { amount: true },
  });

  // Calculate net balance using Decimal arithmetic
  const toReceiveTotal = sumAmounts(toReceive.map((s) => s.amount));
  const toPayTotal = sumAmounts(toPay.map((s) => s.amount));
  const settlementsSentTotal = sumAmounts(settlementsSent.map((s) => s.amount));
  const settlementsReceivedTotal = sumAmounts(
    settlementsReceived.map((s) => s.amount)
  );

  // Net balance: (amount to receive) - (amount to pay) + (settlements sent) - (settlements received)
  const netBalance = toReceiveTotal
    .minus(toPayTotal)
    .plus(settlementsSentTotal)
    .minus(settlementsReceivedTotal);

  return toNumber(netBalance);
}

export default protectedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/currency/with-balance",
      tags: ["currency"],
      summary: "Get currencies with balances",
      description:
        "Get list of currencies that have significant balances in a chat",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    return getCurrenciesWithBalanceHandler(input, ctx.db);
  });
