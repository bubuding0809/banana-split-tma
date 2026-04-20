import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { TRPCError } from "@trpc/server";
import { parseMonthRange } from "../../utils/monthRange.js";
import { toNumber, sumAmounts } from "../../utils/financial.js";
import { Decimal } from "decimal.js";

const inputSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "month must be YYYY-MM",
  }),
});

const outputSchema = z.object({
  month: z.string(),
  chats: z.array(
    z.object({
      chatId: z.number(),
      chatTitle: z.string(),
      spend: z.array(z.object({ currency: z.string(), amount: z.number() })),
    })
  ),
  totals: z.array(z.object({ currency: z.string(), amount: z.number() })),
});

type Output = z.infer<typeof outputSchema>;

export async function getMySpendByMonthHandler(
  callerId: number,
  month: string,
  db: Db
): Promise<Output> {
  const { start, endExclusive } = parseMonthRange(month); // throws on malformed

  const chats = await db.chat.findMany({
    where: { members: { some: { id: BigInt(callerId) } } },
    select: { id: true, title: true },
  });
  if (chats.length === 0) return { month, chats: [], totals: [] };

  const chatIds = chats.map((c) => c.id);

  const shares = await db.expenseShare.findMany({
    where: {
      userId: BigInt(callerId),
      expense: {
        chatId: { in: chatIds },
        date: { gte: start, lt: endExclusive },
      },
    },
    select: {
      amount: true,
      expense: { select: { chatId: true, currency: true } },
    },
  });

  // Group by (chatId, currency)
  const byChatCurrency = new Map<number, Map<string, typeof shares>>();
  for (const s of shares) {
    const chatId = Number(s.expense.chatId);
    const cur = s.expense.currency;
    if (!byChatCurrency.has(chatId)) byChatCurrency.set(chatId, new Map());
    const inner = byChatCurrency.get(chatId)!;
    if (!inner.has(cur)) inner.set(cur, []);
    inner.get(cur)!.push(s);
  }

  const titleById = new Map<number, string>();
  for (const c of chats) titleById.set(Number(c.id), c.title);

  const chatRows: Output["chats"] = [];
  const totalsMap = new Map<string, Decimal>();

  // Stable chat order: by title ascending
  const chatIdsWithData = Array.from(byChatCurrency.keys()).sort((a, b) => {
    const ta = titleById.get(a) ?? "";
    const tb = titleById.get(b) ?? "";
    return ta.localeCompare(tb);
  });

  for (const chatId of chatIdsWithData) {
    const spendMap = byChatCurrency.get(chatId)!;
    const spend: Output["chats"][number]["spend"] = [];
    for (const [currency, rows] of spendMap) {
      const decSum = sumAmounts(rows.map((r) => r.amount));
      spend.push({ currency, amount: toNumber(decSum) });
      totalsMap.set(
        currency,
        (totalsMap.get(currency) ?? new Decimal(0)).plus(decSum)
      );
    }
    spend.sort((a, b) => a.currency.localeCompare(b.currency));
    chatRows.push({
      chatId,
      chatTitle: titleById.get(chatId) ?? "Unknown",
      spend,
    });
  }

  const totals = Array.from(totalsMap.entries())
    .map(([currency, dec]) => ({ currency, amount: toNumber(dec) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return { month, chats: chatRows, totals };
}

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    if (!ctx.session.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }
    return getMySpendByMonthHandler(
      Number(ctx.session.user.id),
      input.month,
      ctx.db
    );
  });
