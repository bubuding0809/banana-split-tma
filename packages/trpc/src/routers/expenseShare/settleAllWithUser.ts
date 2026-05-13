import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { getMyCounterpartyBalancesHandler } from "./getMyCounterpartyBalances.js";
import { buildSettleNotificationCaption } from "../../services/crossGroupDmTemplates.js";
import { createBroadcast } from "../../services/broadcast.js";

const inputSchema = z.object({
  counterpartyUserId: z.number(),
});

const outputSchema = z.object({
  settled: z.number(),
  baseCurrency: z.string(),
  totalBaseAbs: z.number(),
});

export interface Deps {
  getCounterpartyBalances: typeof getMyCounterpartyBalancesHandler;
  sendDm: (userId: number, caption: string) => Promise<void>;
}

export async function settleAllWithUserHandler(
  args: { callerId: number; counterpartyUserId: number },
  db: Db,
  deps: Deps
): Promise<z.infer<typeof outputSchema>> {
  // Recompute fresh balances inside the mutation — never trust client amounts.
  const fresh = await deps.getCounterpartyBalances(
    { callerId: args.callerId },
    db
  );
  const cp = fresh.counterparties.find(
    (c) => c.userId === args.counterpartyUserId
  );
  if (!cp || cp.groups.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No outstanding balance with this user",
    });
  }

  let settledCount = 0;
  await db.$transaction(async (tx) => {
    for (const g of cp.groups) {
      if (Math.abs(g.nativeNet) === 0) continue;
      // Positive nativeNet => counterparty owes caller (caller is creditor).
      // Negative nativeNet => caller owes counterparty.
      const debtorIsCaller = g.nativeNet < 0;
      const senderId = debtorIsCaller ? args.callerId : args.counterpartyUserId;
      const receiverId = debtorIsCaller
        ? args.counterpartyUserId
        : args.callerId;
      await tx.settlement.create({
        data: {
          chatId: BigInt(g.chatId),
          senderId: BigInt(senderId),
          receiverId: BigInt(receiverId),
          amount: Math.abs(g.nativeNet),
          currency: g.currency,
        },
      });
      settledCount += 1;
    }
  });

  // Best-effort DM outside the tx so Telegram errors don't roll back the writes.
  if (cp.hasStartedBot) {
    const caller = await db.user.findUnique({
      where: { id: BigInt(args.callerId) },
      select: { firstName: true, lastName: true },
    });
    const senderName = [caller?.firstName, caller?.lastName]
      .filter(Boolean)
      .join(" ");
    const caption = buildSettleNotificationCaption({
      senderName: senderName || "Someone",
      baseCurrency: fresh.baseCurrency,
      totalBaseAbs: Math.abs(cp.totalBaseNet),
      groups: cp.groups.map((g) => ({
        chatTitle: g.chatTitle,
        currency: g.currency,
        nativeAbs: Math.abs(g.nativeNet),
      })),
    });
    try {
      await deps.sendDm(args.counterpartyUserId, caption);
    } catch (e) {
      console.warn("[settleAllWithUser] DM failed:", e);
    }
  }

  return {
    settled: settledCount,
    baseCurrency: fresh.baseCurrency,
    totalBaseAbs: Math.abs(cp.totalBaseNet),
  };
}

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ ctx, input }) => {
    assertNotChatScoped(ctx.session);
    if (!ctx.session.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }
    const callerId = Number(ctx.session.user.id);
    const sendDm = async (userId: number, caption: string) => {
      await createBroadcast(
        { db: ctx.db, teleBot: ctx.teleBot, log: ctx.log },
        {
          message: caption,
          targetUserIds: [userId],
          createdByTelegramId: BigInt(callerId),
        }
      );
    };
    return settleAllWithUserHandler(
      {
        callerId,
        counterpartyUserId: input.counterpartyUserId,
      },
      ctx.db,
      {
        getCounterpartyBalances: getMyCounterpartyBalancesHandler,
        sendDm,
      }
    );
  });
