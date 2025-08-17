import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { getDebtorsHandler } from "../chat/getDebtors.js";
import { getCreditorsHandler } from "../chat/getCreditors.js";
import { getSupportedCurrenciesHandler } from "./getSupportedCurrencies.js";

export const inputSchema = z.object({
  userId: z.number().transform((val) => BigInt(val)),
  chatId: z.number().transform((val) => BigInt(val)),
});

export const outputSchema = z.array(
  z.object({
    currency: z.object({
      code: z.string(),
      name: z.string(),
      flagEmoji: z.string(),
    }),
    debtors: z.array(
      z.object({
        id: z.number(),
        balance: z.number(),
      })
    ),
    creditors: z.array(
      z.object({
        id: z.number(),
        balance: z.number(),
      })
    ),
    lastCreatedAt: z.date(),
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

    const supportedCurrencies = await getSupportedCurrenciesHandler(
      {
        includeRates: false,
        onlyWithRates: false,
      },
      db
    );

    const filteredCurrencies = supportedCurrencies.filter((currency) =>
      allUsedCurrencies.includes(currency.code)
    );

    if (filteredCurrencies.length === 0) {
      return [];
    }

    const usedCurrenciesWithBalanceInfo = await Promise.all(
      filteredCurrencies.map(async (currency) => {
        const [debtors, creditors, latestExpense, latestSettlement] =
          await Promise.all([
            getDebtorsHandler(
              {
                chatId: Number(input.chatId),
                userId: Number(input.userId),
                currency: currency.code,
              },
              db
            ),
            getCreditorsHandler(
              {
                chatId: Number(input.chatId),
                userId: Number(input.userId),
                currency: currency.code,
              },
              db
            ),
            db.expense.findFirst({
              where: {
                chatId: input.chatId,
                currency: currency.code,
              },
              orderBy: { createdAt: "desc" },
              select: { createdAt: true },
            }),
            db.settlement.findFirst({
              where: {
                chatId: input.chatId,
                currency: currency.code,
              },
              orderBy: { createdAt: "desc" },
              select: { createdAt: true },
            }),
          ]);

        // Get the most recent createdAt from either expenses or settlements
        const lastCreatedAt = new Date(
          Math.max(
            latestExpense?.createdAt?.getTime() || 0,
            latestSettlement?.createdAt?.getTime() || 0
          )
        );

        return {
          currency: {
            code: currency.code,
            name: currency.name,
            flagEmoji: currency.flagEmoji,
          },
          debtors: debtors.map((debtor) => ({
            id: Number(debtor.id),
            balance: debtor.balance,
          })),
          creditors: creditors.map((creditor) => ({
            id: Number(creditor.id),
            balance: creditor.balance,
          })),
          lastCreatedAt,
        };
      })
    );

    // Sort by lastCreatedAt in descending order (most recent first)
    return usedCurrenciesWithBalanceInfo.sort(
      (a, b) => b.lastCreatedAt.getTime() - a.lastCreatedAt.getTime()
    );
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
