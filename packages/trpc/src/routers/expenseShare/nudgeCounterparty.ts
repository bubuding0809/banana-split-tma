import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { getMyCounterpartyBalancesHandler } from "./getMyCounterpartyBalances.js";
import { buildNudgeCaption } from "../../services/crossGroupDmTemplates.js";
import { createBroadcast } from "../../services/broadcast.js";
import { takeToken } from "../../utils/rateLimit.js";
import { FINANCIAL_THRESHOLDS } from "../../utils/financial.js";

const NUDGE_WINDOW_MS = 86_400_000; // 24h

const inputSchema = z.object({ counterpartyUserId: z.number() });
const outputSchema = z.object({ ok: z.literal(true) });

export interface Deps {
  getCounterpartyBalances: typeof getMyCounterpartyBalancesHandler;
  sendDm: (userId: number, caption: string) => Promise<void>;
  takeToken: (key: string, limit: number, windowMs: number) => boolean;
}

export async function nudgeCounterpartyHandler(
  args: { callerId: number; counterpartyUserId: number },
  db: Db,
  deps: Deps
): Promise<z.infer<typeof outputSchema>> {
  if (
    !deps.takeToken(
      `nudge:${args.callerId}:${args.counterpartyUserId}`,
      1,
      NUDGE_WINDOW_MS
    )
  ) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "You have already nudged this user in the last 24 hours",
    });
  }

  const fresh = await deps.getCounterpartyBalances(
    { callerId: args.callerId },
    db
  );
  const cp = fresh.counterparties.find(
    (c) => c.userId === args.counterpartyUserId
  );
  if (!cp || cp.totalBaseNet <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Nothing to nudge — they don't owe you",
    });
  }
  if (!cp.hasStartedBot) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Counterparty has not started the bot",
    });
  }

  const caller = await db.user.findUnique({
    where: { id: BigInt(args.callerId) },
    select: { firstName: true, lastName: true },
  });
  const senderName =
    [caller?.firstName, caller?.lastName].filter(Boolean).join(" ") ||
    "Someone";

  const caption = buildNudgeCaption({
    senderName,
    baseCurrency: fresh.baseCurrency,
    totalBaseAbs: cp.totalBaseNet,
    groups: cp.groups
      .filter((g) => Math.abs(g.nativeNet) > FINANCIAL_THRESHOLDS.DISPLAY)
      .map((g) => ({
        chatId: g.chatId,
        chatTitle: g.chatTitle,
        currency: g.currency,
        nativeAbs: Math.abs(g.nativeNet),
        baseAbs: Math.abs(g.baseNet),
      })),
  });

  await deps.sendDm(args.counterpartyUserId, caption);
  return { ok: true as const };
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
    return nudgeCounterpartyHandler(
      {
        callerId,
        counterpartyUserId: input.counterpartyUserId,
      },
      ctx.db,
      {
        getCounterpartyBalances: getMyCounterpartyBalancesHandler,
        sendDm,
        takeToken,
      }
    );
  });
