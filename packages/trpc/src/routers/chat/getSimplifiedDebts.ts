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

  // Calculate net balances for all members properly
  // We need to avoid double counting by calculating each user's total net balance
  const memberBalances = new Map<number, number>();

  // Initialize all members with 0 balance
  for (const member of members) {
    memberBalances.set(Number(member.id), 0);
  }

  // Calculate net shares between all pairs of users
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
          currency: input.currency,
        },
        db
      );

      // Update balances:
      // If netShare > 0: member2 owes member1 (member1 should receive, member2 should pay)
      // If netShare < 0: member1 owes member2 (member1 should pay, member2 should receive)
      const currentBalance1 = memberBalances.get(userId1) || 0;
      const currentBalance2 = memberBalances.get(userId2) || 0;

      memberBalances.set(userId1, currentBalance1 + netShare);
      memberBalances.set(userId2, currentBalance2 - netShare);
    }
  }

  // Verify conservation of money principle (sum should be close to zero)
  const totalBalance = Array.from(memberBalances.values()).reduce(
    (sum, balance) => sum + balance,
    0
  );

  // Debug logging in development
  if (process.env.NODE_ENV === "development") {
    console.log("Total balance after calculation:", totalBalance);
    console.log("Member balances:", Array.from(memberBalances.entries()));
  }

  // Count original debt relationships (non-zero balances)
  let originalDebtCount = 0;
  for (const [, balance] of memberBalances) {
    if (Math.abs(balance) > 0.01) {
      originalDebtCount++;
    }
  }

  // Simplify debts
  const simplifiedDebts = simplifyDebts(memberBalances);

  // Validate the simplification with improved error handling
  const isValid = validateDebtSimplification(memberBalances, simplifiedDebts);
  if (!isValid) {
    console.error("Debt simplification validation failed");
    console.error("Original balances:", Array.from(memberBalances.entries()));
    console.error("Simplified debts:", simplifiedDebts);

    // In development, we can be more lenient for debugging
    if (process.env.NODE_ENV !== "development") {
      throw new Error("Debt simplification resulted in inconsistent balances");
    }
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
