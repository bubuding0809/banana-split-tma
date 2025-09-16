import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { getMembersHandler } from "./getMembers.js";
import { getNetShareHandler } from "../expenseShare/getNetShare.js";
import {
  simplifyDebts,
  calculateTransactionReduction,
  validateDebtSimplification,
} from "../../utils/debtSimplification.js";

const inputSchema = z.object({
  chatId: z.number(),
});

const outputSchema = z.object({
  simplifiedDebts: z.array(
    z.object({
      fromUserId: z.number(),
      toUserId: z.number(),
      balances: z.array(
        z.object({
          currency: z.string(),
          amount: z.number(),
        })
      ),
    })
  ),
  transactionReduction: z.record(
    z.string(), // currency code
    z.object({
      original: z.number(),
      simplified: z.number(),
      reduction: z.number(),
      reductionPercentage: z.number(),
    })
  ),
  chatMembers: z.array(
    z.object({
      id: z.number(),
      username: z.string().nullable(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
    })
  ),
});

export const getSimplifiedDebtsMultiCurrencyHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  // Get all chat members
  const members = await getMembersHandler({ chatId: input.chatId }, db);

  if (!members || members.length === 0) {
    return {
      simplifiedDebts: [],
      transactionReduction: {},
      chatMembers: [],
    };
  }

  // Get all unique currencies used in this chat
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

  const allUsedCurrencies = [
    ...new Set([
      ...expenseCurrencies.map((e) => e.currency),
      ...settlementCurrencies.map((s) => s.currency),
    ]),
  ];

  if (allUsedCurrencies.length === 0) {
    return {
      simplifiedDebts: [],
      transactionReduction: {},
      chatMembers: [],
    };
  }

  // Process each currency separately
  const currencyResults = await Promise.all(
    allUsedCurrencies.map(async (currency) => {
      // Calculate net balances for all members for this currency
      const memberBalances = new Map<number, number>();

      // Initialize all members with 0 balance
      for (const member of members) {
        memberBalances.set(Number(member.id), 0);
      }

      // Calculate net shares between all pairs of users for this currency
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const member1 = members[i]!;
          const member2 = members[j]!;
          const userId1 = Number(member1.id);
          const userId2 = Number(member2.id);

          // Get the net share from member1's perspective towards member2
          const netShare = await getNetShareHandler(
            {
              mainUserId: userId1,
              targetUserId: userId2,
              chatId: input.chatId,
              currency,
            },
            db
          );

          // Update balances
          const currentBalance1 = memberBalances.get(userId1) || 0;
          const currentBalance2 = memberBalances.get(userId2) || 0;

          memberBalances.set(userId1, currentBalance1 + netShare);
          memberBalances.set(userId2, currentBalance2 - netShare);
        }
      }

      // Count original debt relationships (non-zero balances)
      let originalDebtCount = 0;
      for (const [, balance] of memberBalances) {
        if (Math.abs(balance) > 0.01) {
          originalDebtCount++;
        }
      }

      // Simplify debts for this currency
      const simplifiedDebts = simplifyDebts(memberBalances);

      // Validate the simplification
      validateDebtSimplification(memberBalances, simplifiedDebts);

      // Calculate transaction reduction
      const transactionReduction = calculateTransactionReduction(
        originalDebtCount,
        simplifiedDebts.length
      );

      return {
        currency,
        simplifiedDebts,
        transactionReduction,
      };
    })
  );

  // Combine simplified debts across currencies
  const debtMap = new Map<string, { currency: string; amount: number }[]>();

  // Group debts by user pairs
  for (const currencyResult of currencyResults) {
    const { currency, simplifiedDebts } = currencyResult;

    for (const debt of simplifiedDebts) {
      const key = `${debt.fromUserId}-${debt.toUserId}`;

      if (!debtMap.has(key)) {
        debtMap.set(key, []);
      }

      debtMap.get(key)!.push({
        currency,
        amount: debt.amount,
      });
    }
  }

  // Convert map to array format
  const combinedSimplifiedDebts = Array.from(debtMap.entries()).map(
    ([key, balances]) => {
      const [fromUserIdStr, toUserIdStr] = key.split("-");
      const fromUserId = Number(fromUserIdStr);
      const toUserId = Number(toUserIdStr);

      // Ensure we have valid user IDs
      if (isNaN(fromUserId) || isNaN(toUserId)) {
        throw new Error(`Invalid user IDs in debt simplification: ${key}`);
      }

      return {
        fromUserId,
        toUserId,
        balances,
      };
    }
  );

  // Combine transaction reductions
  const combinedTransactionReduction = currencyResults.reduce(
    (acc, { currency, transactionReduction }) => {
      acc[currency] = transactionReduction;
      return acc;
    },
    {} as Record<string, (typeof currencyResults)[0]["transactionReduction"]>
  );

  // Format chat members for response
  const chatMembers = members.map((member) => ({
    id: Number(member.id),
    username: member.username,
    firstName: member.firstName,
    lastName: member.lastName,
  }));

  return {
    simplifiedDebts: combinedSimplifiedDebts,
    transactionReduction: combinedTransactionReduction,
    chatMembers,
  };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    return getSimplifiedDebtsMultiCurrencyHandler(input, ctx.db);
  });
