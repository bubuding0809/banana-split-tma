import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { toNumber, sumAmounts } from "../../utils/financial.js";
import type { Decimal } from "decimal.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number(),
  currencies: z.array(z.string().min(3).max(3)).optional(),
});

export interface BulkDebtResult {
  debtorId: number;
  creditorId: number;
  amount: number;
  currency: string;
}

const outputSchema = z.object({
  debts: z.array(
    z.object({
      debtorId: z.number(),
      creditorId: z.number(),
      amount: z.number(),
      currency: z.string(),
    })
  ),
});

export const getBulkChatDebtsHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<{ debts: BulkDebtResult[] }> => {
  const { chatId, currencies } = input;

  // Get all members for this chat
  const members = await db.user.findMany({
    where: {
      chats: {
        some: { id: chatId },
      },
    },
    select: { id: true },
  });

  if (members.length === 0) {
    return { debts: [] };
  }

  const memberIds = members.map((m) => Number(m.id));

  // Build currency filter
  const currencyFilter = currencies ? { in: currencies } : undefined;

  // Single query to get all expense shares for this chat
  const expenseShares = await db.expenseShare.findMany({
    where: {
      expense: {
        chatId,
        ...(currencyFilter && { currency: currencyFilter }),
      },
    },
    select: {
      userId: true,
      amount: true,
      expense: {
        select: {
          payerId: true,
          currency: true,
        },
      },
    },
  });

  // Single query to get all settlements for this chat
  const settlements = await db.settlement.findMany({
    where: {
      chatId,
      ...(currencyFilter && { currency: currencyFilter }),
    },
    select: {
      senderId: true,
      receiverId: true,
      amount: true,
      currency: true,
    },
  });

  // Group data by currency for efficient processing
  const expenseSharesByCurrency = new Map<string, typeof expenseShares>();
  const settlementsByCurrency = new Map<string, typeof settlements>();

  // Group expense shares by currency
  for (const share of expenseShares) {
    const currency = share.expense.currency;
    if (!expenseSharesByCurrency.has(currency)) {
      expenseSharesByCurrency.set(currency, []);
    }
    expenseSharesByCurrency.get(currency)!.push(share);
  }

  // Group settlements by currency
  for (const settlement of settlements) {
    const currency = settlement.currency;
    if (!settlementsByCurrency.has(currency)) {
      settlementsByCurrency.set(currency, []);
    }
    settlementsByCurrency.get(currency)!.push(settlement);
  }

  const debts: BulkDebtResult[] = [];

  // Get all currencies to process
  const allCurrencies = new Set([
    ...expenseSharesByCurrency.keys(),
    ...settlementsByCurrency.keys(),
  ]);

  // Process each currency
  for (const currency of allCurrencies) {
    const currencyExpenseShares = expenseSharesByCurrency.get(currency) || [];
    const currencySettlements = settlementsByCurrency.get(currency) || [];

    // Calculate debts between all member pairs for this currency
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const mainUserId = memberIds[i];
        const targetUserId = memberIds[j];

        if (!mainUserId || !targetUserId) continue;

        // Calculate net share between these two users for this currency
        const netAmount = calculateNetShareBulk(
          mainUserId,
          targetUserId,
          currencyExpenseShares,
          currencySettlements
        );

        // Only include significant amounts
        if (Math.abs(netAmount) > 0.01) {
          if (netAmount > 0) {
            // targetUserId owes mainUserId
            debts.push({
              debtorId: targetUserId,
              creditorId: mainUserId,
              amount: netAmount,
              currency,
            });
          } else {
            // mainUserId owes targetUserId
            debts.push({
              debtorId: mainUserId,
              creditorId: targetUserId,
              amount: Math.abs(netAmount),
              currency,
            });
          }
        }
      }
    }
  }

  return { debts };
};

/**
 * Calculates net share between two users using pre-fetched data
 * This replaces the individual database queries in getNetShareHandler
 */
function calculateNetShareBulk(
  mainUserId: number,
  targetUserId: number,
  expenseShares: Array<{
    userId: bigint;
    amount: Decimal | null;
    expense: {
      payerId: bigint;
      currency: string;
    };
  }>,
  settlements: Array<{
    senderId: bigint;
    receiverId: bigint;
    amount: Decimal;
    currency: string;
  }>
): number {
  // Find amounts where main user paid, but target user has a share
  const toReceive = expenseShares
    .filter(
      (share) =>
        Number(share.expense.payerId) === mainUserId &&
        Number(share.userId) === targetUserId &&
        share.amount !== null
    )
    .map((share) => share.amount!);

  // Find amounts where target user paid, but main user has a share
  const toPay = expenseShares
    .filter(
      (share) =>
        Number(share.expense.payerId) === targetUserId &&
        Number(share.userId) === mainUserId &&
        share.amount !== null
    )
    .map((share) => share.amount!);

  // Find settlements where main user paid target user
  const settlementsMainToTarget = settlements
    .filter(
      (settlement) =>
        Number(settlement.senderId) === mainUserId &&
        Number(settlement.receiverId) === targetUserId
    )
    .map((settlement) => settlement.amount);

  // Find settlements where target user paid main user
  const settlementsTargetToMain = settlements
    .filter(
      (settlement) =>
        Number(settlement.senderId) === targetUserId &&
        Number(settlement.receiverId) === mainUserId
    )
    .map((settlement) => settlement.amount);

  // Calculate totals using Decimal arithmetic
  const toReceiveTotal = sumAmounts(toReceive);
  const toPayTotal = sumAmounts(toPay);
  const settlementsMainToTargetTotal = sumAmounts(settlementsMainToTarget);
  const settlementsTargetToMainTotal = sumAmounts(settlementsTargetToMain);

  // Calculate net balance
  const netAmountDecimal = toReceiveTotal
    .minus(toPayTotal)
    .plus(settlementsMainToTargetTotal)
    .minus(settlementsTargetToMainTotal);

  return toNumber(netAmountDecimal);
}

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return getBulkChatDebtsHandler(input, ctx.db);
  });
