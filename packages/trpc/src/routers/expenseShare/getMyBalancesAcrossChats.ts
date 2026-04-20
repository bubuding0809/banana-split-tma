import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { TRPCError } from "@trpc/server";
import {
  buildUserBalanceMap,
  computeChatPairwiseBalances,
} from "../../utils/chatBalances.js";
import { simplifyDebts } from "../../utils/debtSimplification.js";
import { FINANCIAL_THRESHOLDS } from "../../utils/financial.js";

const outputSchema = z.object({
  balances: z.array(
    z.object({
      chatId: z.number(),
      chatTitle: z.string(),
      debtSimplificationEnabled: z.boolean(),
      currencies: z.array(z.object({ currency: z.string(), net: z.number() })),
      counterparties: z.array(
        z.object({
          userId: z.number(),
          name: z.string(),
          currency: z.string(),
          net: z.number(),
        })
      ),
    })
  ),
});

type Output = z.infer<typeof outputSchema>;

function displayName(firstName: string, lastName: string | null): string {
  return lastName ? `${firstName} ${lastName}` : firstName;
}

export async function getMyBalancesAcrossChatsHandler(
  callerId: number,
  db: Db
): Promise<Output> {
  const chats = await db.chat.findMany({
    where: { members: { some: { id: BigInt(callerId) } } },
    select: {
      id: true,
      title: true,
      debtSimplificationEnabled: true,
      members: { select: { id: true } },
    },
  });
  if (chats.length === 0) return { balances: [] };

  const chatIds = chats.map((c) => c.id);

  // Batch fetch expense shares + settlements across ALL caller's chats
  const allShares = await db.expenseShare.findMany({
    where: { expense: { chatId: { in: chatIds } } },
    select: {
      userId: true,
      amount: true,
      expense: {
        select: {
          chatId: true,
          payerId: true,
          currency: true,
        },
      },
    },
  });

  const allSettlements = await db.settlement.findMany({
    where: { chatId: { in: chatIds } },
    select: {
      chatId: true,
      senderId: true,
      receiverId: true,
      amount: true,
      currency: true,
    },
  });

  // Index by chatId as number
  const sharesByChat = new Map<number, typeof allShares>();
  for (const s of allShares) {
    const k = Number(s.expense.chatId);
    if (!sharesByChat.has(k)) sharesByChat.set(k, []);
    sharesByChat.get(k)!.push(s);
  }

  const settlementsByChat = new Map<number, typeof allSettlements>();
  for (const s of allSettlements) {
    const k = Number(s.chatId);
    if (!settlementsByChat.has(k)) settlementsByChat.set(k, []);
    settlementsByChat.get(k)!.push(s);
  }

  const balances: Output["balances"] = [];
  const counterpartyIds = new Set<number>();

  for (const chat of chats) {
    const chatIdNum = Number(chat.id);
    const memberIds = chat.members.map((m) => Number(m.id));
    if (!memberIds.includes(callerId)) continue;

    const chatShares = sharesByChat.get(chatIdNum) ?? [];
    const chatSettlements = settlementsByChat.get(chatIdNum) ?? [];

    // Group by currency
    const sharesByCurrency = new Map<string, typeof chatShares>();
    for (const s of chatShares) {
      const cur = s.expense.currency;
      if (!sharesByCurrency.has(cur)) sharesByCurrency.set(cur, []);
      sharesByCurrency.get(cur)!.push(s);
    }
    const settlementsByCurrency = new Map<string, typeof chatSettlements>();
    for (const s of chatSettlements) {
      if (!settlementsByCurrency.has(s.currency))
        settlementsByCurrency.set(s.currency, []);
      settlementsByCurrency.get(s.currency)!.push(s);
    }

    const allCurrencies = new Set([
      ...sharesByCurrency.keys(),
      ...settlementsByCurrency.keys(),
    ]);

    const currencyRows: Output["balances"][number]["currencies"] = [];
    const counterpartyRows: Output["balances"][number]["counterparties"] = [];

    for (const currency of allCurrencies) {
      const shares = sharesByCurrency.get(currency) ?? [];
      const settlements = settlementsByCurrency.get(currency) ?? [];

      const balanceMap = buildUserBalanceMap(memberIds, shares, settlements);
      const callerNet = balanceMap.get(callerId) ?? 0;
      if (Math.abs(callerNet) <= FINANCIAL_THRESHOLDS.DISPLAY) continue;

      currencyRows.push({ currency, net: callerNet });

      if (chat.debtSimplificationEnabled) {
        const simplified = simplifyDebts(balanceMap);
        for (const edge of simplified) {
          if (edge.fromUserId === callerId) {
            counterpartyRows.push({
              userId: edge.toUserId,
              name: "", // filled in after User.findMany
              currency,
              net: -edge.amount,
            });
            counterpartyIds.add(edge.toUserId);
          } else if (edge.toUserId === callerId) {
            counterpartyRows.push({
              userId: edge.fromUserId,
              name: "",
              currency,
              net: edge.amount,
            });
            counterpartyIds.add(edge.fromUserId);
          }
        }
      } else {
        const pairs = computeChatPairwiseBalances(
          memberIds,
          shares,
          settlements
        );
        for (const p of pairs) {
          if (p.creditorId === callerId) {
            counterpartyRows.push({
              userId: p.debtorId,
              name: "",
              currency,
              net: p.amount, // debtor owes caller → positive
            });
            counterpartyIds.add(p.debtorId);
          } else if (p.debtorId === callerId) {
            counterpartyRows.push({
              userId: p.creditorId,
              name: "",
              currency,
              net: -p.amount, // caller owes creditor → negative
            });
            counterpartyIds.add(p.creditorId);
          }
        }
      }
    }

    if (currencyRows.length === 0) continue;

    balances.push({
      chatId: chatIdNum,
      chatTitle: chat.title,
      debtSimplificationEnabled: chat.debtSimplificationEnabled,
      currencies: currencyRows,
      counterparties: counterpartyRows,
    });
  }

  // Resolve names in one query
  if (counterpartyIds.size > 0) {
    const users = await db.user.findMany({
      where: { id: { in: Array.from(counterpartyIds).map((n) => BigInt(n)) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map<number, string>();
    for (const u of users) {
      nameById.set(Number(u.id), displayName(u.firstName, u.lastName));
    }
    for (const chat of balances) {
      for (const cp of chat.counterparties) {
        cp.name = nameById.get(cp.userId) ?? "Unknown";
      }
    }
  }

  return { balances };
}

export default protectedProcedure
  .output(outputSchema)
  .query(async ({ ctx }) => {
    assertNotChatScoped(ctx.session);
    if (!ctx.session.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }
    return getMyBalancesAcrossChatsHandler(Number(ctx.session.user.id), ctx.db);
  });
