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
  currency: z.string().min(3).max(3, "Currency code must be 3 characters long"),
});

const outputSchema = z.object({
  simplifiedDebts: z.array(
    z.object({
      fromUserId: z.number(),
      toUserId: z.number(),
      amount: z.number(),
    })
  ),
  transactionReduction: z.object({
    original: z.number(),
    simplified: z.number(),
    reduction: z.number(),
    reductionPercentage: z.number(),
  }),
  chatMembers: z.array(
    z.object({
      id: z.number(),
      username: z.string().nullable(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
    })
  ),
});

export const getSimplifiedDebtsHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  // Get all chat members
  const members = await getMembersHandler({ chatId: input.chatId }, db);

  if (!members || members.length === 0) {
    return {
      simplifiedDebts: [],
      transactionReduction: {
        original: 0,
        simplified: 0,
        reduction: 0,
        reductionPercentage: 0,
      },
      chatMembers: [],
    };
  }

  // Calculate net balances for all members
  const balancePromises = members.map(async (member) => {
    const memberBalances = await Promise.all(
      members
        .filter((otherMember) => Number(otherMember.id) !== Number(member.id))
        .map(async (otherMember) => {
          const netShare = await getNetShareHandler(
            {
              mainUserId: Number(member.id),
              targetUserId: Number(otherMember.id),
              chatId: input.chatId,
              currency: input.currency,
            },
            db
          );
          return netShare;
        })
    );

    // Sum all balances for this member
    const totalBalance = memberBalances.reduce(
      (sum, balance) => sum + balance,
      0
    );

    return {
      userId: Number(member.id),
      balance: totalBalance,
    };
  });

  const memberBalances = await Promise.all(balancePromises);

  // Create balance map for the simplification algorithm
  const balanceMap = new Map<number, number>();
  let originalDebtCount = 0;

  for (const { userId, balance } of memberBalances) {
    balanceMap.set(userId, balance);

    // Count original debt relationships (non-zero balances)
    if (Math.abs(balance) > 0.01) {
      originalDebtCount++;
    }
  }

  // Simplify debts
  const simplifiedDebts = simplifyDebts(balanceMap);

  // Validate the simplification
  const isValid = validateDebtSimplification(balanceMap, simplifiedDebts);
  if (!isValid) {
    throw new Error("Debt simplification resulted in inconsistent balances");
  }

  // Calculate transaction reduction
  const transactionReduction = calculateTransactionReduction(
    originalDebtCount,
    simplifiedDebts.length
  );

  // Format chat members for response
  const chatMembers = members.map((member) => ({
    id: Number(member.id),
    username: member.username,
    firstName: member.firstName,
    lastName: member.lastName,
  }));

  return {
    simplifiedDebts,
    transactionReduction,
    chatMembers,
  };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    return getSimplifiedDebtsHandler(input, ctx.db);
  });
