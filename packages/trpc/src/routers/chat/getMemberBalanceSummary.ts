import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { buildUserBalanceMap } from "../../utils/chatBalances.js";
import { FINANCIAL_THRESHOLDS } from "../../utils/financial.js";

const inputSchema = z.object({
  chatId: z.number(),
  userId: z.number(),
});

const outputSchema = z.object({
  userId: z.number(),
  balances: z.array(
    z.object({
      currency: z.string(),
      amount: z.number(),
    })
  ),
});

export const getMemberBalanceSummaryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    select: { members: { select: { id: true } } },
  });
  if (!chat) {
    return { userId: input.userId, balances: [] };
  }

  const memberIds = chat.members.map((m) => Number(m.id));

  const [shares, settlements] = await Promise.all([
    db.expenseShare.findMany({
      where: { expense: { chatId: input.chatId } },
      select: {
        userId: true,
        amount: true,
        expense: { select: { payerId: true, currency: true } },
      },
    }),
    db.settlement.findMany({
      where: { chatId: input.chatId },
      select: {
        senderId: true,
        receiverId: true,
        amount: true,
        currency: true,
      },
    }),
  ]);

  const sharesByCurrency = new Map<string, typeof shares>();
  for (const s of shares) {
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

  const allCurrencies = new Set<string>([
    ...sharesByCurrency.keys(),
    ...settlementsByCurrency.keys(),
  ]);

  const balances: { currency: string; amount: number }[] = [];
  for (const currency of allCurrencies) {
    const map = buildUserBalanceMap(
      memberIds,
      sharesByCurrency.get(currency) ?? [],
      settlementsByCurrency.get(currency) ?? []
    );
    const amount = map.get(input.userId) ?? 0;
    if (Math.abs(amount) > FINANCIAL_THRESHOLDS.DISPLAY) {
      balances.push({ currency, amount });
    }
  }

  return { userId: input.userId, balances };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return getMemberBalanceSummaryHandler(input, ctx.db);
  });
