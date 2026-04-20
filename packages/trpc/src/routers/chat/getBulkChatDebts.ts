import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { computeChatPairwiseBalances } from "../../utils/chatBalances.js";

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

  const members = await db.user.findMany({
    where: { chats: { some: { id: chatId } } },
    select: { id: true },
  });
  if (members.length === 0) return { debts: [] };
  const memberIds = members.map((m) => Number(m.id));

  const currencyFilter = currencies ? { in: currencies } : undefined;

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
      expense: { select: { payerId: true, currency: true } },
    },
  });

  const settlements = await db.settlement.findMany({
    where: { chatId, ...(currencyFilter && { currency: currencyFilter }) },
    select: {
      senderId: true,
      receiverId: true,
      amount: true,
      currency: true,
    },
  });

  const sharesByCurrency = new Map<string, typeof expenseShares>();
  for (const s of expenseShares) {
    const cur = s.expense.currency;
    if (!sharesByCurrency.has(cur)) sharesByCurrency.set(cur, []);
    sharesByCurrency.get(cur)!.push(s);
  }

  const settlementsByCurrency = new Map<string, typeof settlements>();
  for (const s of settlements) {
    if (!settlementsByCurrency.has(s.currency))
      settlementsByCurrency.set(s.currency, []);
    settlementsByCurrency.get(s.currency)!.push(s);
  }

  const debts: BulkDebtResult[] = [];
  const allCurrencies = new Set([
    ...sharesByCurrency.keys(),
    ...settlementsByCurrency.keys(),
  ]);

  for (const currency of allCurrencies) {
    const pairs = computeChatPairwiseBalances(
      memberIds,
      sharesByCurrency.get(currency) ?? [],
      settlementsByCurrency.get(currency) ?? []
    );
    for (const p of pairs) {
      debts.push({ ...p, currency });
    }
  }

  return { debts };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return getBulkChatDebtsHandler(input, ctx.db);
  });
