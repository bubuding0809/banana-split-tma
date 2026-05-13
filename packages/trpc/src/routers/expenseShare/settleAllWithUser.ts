import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { getMyCounterpartyBalancesHandler } from "./getMyCounterpartyBalances.js";
import { buildSettleNotificationCaption } from "../../services/crossGroupDmTemplates.js";
import { FINANCIAL_THRESHOLDS } from "../../utils/financial.js";
import {
  buildCounterpartyDeepLinkPayload,
  buildMiniAppUrl,
} from "../../utils/counterpartyDeepLink.js";
import type { InlineKb } from "./nudgeCounterparty.js";

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
  sendDm: (
    userId: number,
    caption: string,
    replyMarkup?: InlineKb
  ) => Promise<void>;
  getBotUsername: () => Promise<string>;
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
      if (Math.abs(g.nativeNet) <= FINANCIAL_THRESHOLDS.DISPLAY) continue;
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
      // Mirror the settlement-write filter so the tree only shows buckets
      // that were actually settled (not sub-threshold "all zeroed" lies).
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
    // Inline button → recipient's TMA, opens caller's sheet so they can
    // verify the settlement landed correctly. After settle, caller will
    // be filtered out of the recipient's People list (zero balance) so
    // the sheet auto-open silently no-ops — they just see the updated
    // list.
    let replyMarkup: InlineKb | undefined;
    try {
      const botUsername = await deps.getBotUsername();
      const payload = buildCounterpartyDeepLinkPayload(
        args.counterpartyUserId,
        args.callerId
      );
      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: "📊 View Balances",
              url: buildMiniAppUrl(botUsername, payload),
            },
          ],
        ],
      };
    } catch {
      // bot getMe failure → ship the caption without a button
    }

    try {
      await deps.sendDm(args.counterpartyUserId, caption, replyMarkup);
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
    const sendDm = async (
      userId: number,
      caption: string,
      replyMarkup?: InlineKb
    ) => {
      await ctx.teleBot.sendMessage(userId, caption, {
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    };
    let cachedBotUsername: string | undefined;
    const getBotUsername = async () => {
      if (cachedBotUsername) return cachedBotUsername;
      const me = await ctx.teleBot.getMe();
      cachedBotUsername = me.username;
      return cachedBotUsername;
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
        getBotUsername,
      }
    );
  });
