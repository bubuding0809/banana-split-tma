import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { getMyCounterpartyBalancesHandler } from "./getMyCounterpartyBalances.js";
import { buildNudgeCaption } from "../../services/crossGroupDmTemplates.js";
import { takeToken } from "../../utils/rateLimit.js";
import { FINANCIAL_THRESHOLDS } from "../../utils/financial.js";
import {
  buildCounterpartyDeepLinkPayload,
  buildMiniAppUrl,
} from "../../utils/counterpartyDeepLink.js";

// Structural inline-keyboard type (matches Telegram Bot API).
export type InlineKb = {
  inline_keyboard: Array<Array<{ text: string; url: string }>>;
};

const NUDGE_WINDOW_MS = 86_400_000; // 24h

const inputSchema = z.object({ counterpartyUserId: z.number() });
const outputSchema = z.object({
  ok: z.literal(true),
  // Epoch ms when the next nudge to this counterparty is allowed.
  nudgeCooldownUntil: z.number(),
});

export interface Deps {
  getCounterpartyBalances: typeof getMyCounterpartyBalancesHandler;
  sendDm: (
    userId: number,
    caption: string,
    replyMarkup?: InlineKb
  ) => Promise<void>;
  takeToken: (key: string, limit: number, windowMs: number) => boolean;
  // Bot username used to build t.me deep-link URLs. Fetched once per
  // request from ctx.teleBot.getMe(); injected here so unit tests can
  // stub it without a network call.
  getBotUsername: () => Promise<string>;
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

  // Build the inline button URL — recipient is the counterparty (who
  // we're nudging); we want their TMA to land on the People sheet for
  // the caller (the creditor they need to pay).
  // Wrapped in try/catch: a getMe() failure must not forfeit the 24h
  // rate-limit token that's already been consumed above. Mirrors the
  // pattern in settleAllWithUser.
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
            text: "💁 Open Balances",
            url: buildMiniAppUrl(botUsername, payload),
          },
        ],
      ],
    };
  } catch {
    // bot getMe failure → ship the caption without a button rather
    // than re-throw and waste the rate-limit token.
  }

  await deps.sendDm(args.counterpartyUserId, caption, replyMarkup);
  return {
    ok: true as const,
    nudgeCooldownUntil: Date.now() + NUDGE_WINDOW_MS,
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
        getBotUsername,
      }
    );
  });
