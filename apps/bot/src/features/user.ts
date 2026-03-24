import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { TRPCError } from "@trpc/server";
import { BotMessages } from "./messages.js";
import { escapeMarkdownV2 } from "../utils/markdown.js";

export const userFeature = new Composer<BotContext>();

userFeature.command("start", async (ctx, next) => {
  if (!ctx.from) return next();

  const startArg = ctx.match;

  await ctx.replyWithChatAction("typing");

  const loaderMessage = await ctx.reply(BotMessages.START_LOADER_MESSAGE, {
    message_thread_id: ctx.message?.message_thread_id,
  });

  try {
    let exists = false;
    try {
      await ctx.trpc.user.getUser({ userId: ctx.from.id });
      exists = true;
    } catch (err) {
      if (err instanceof TRPCError && err.code === "NOT_FOUND") {
        exists = false;
      } else {
        throw err;
      }
    }

    if (exists) {
      if (startArg === "register") {
        await ctx.api.editMessageText(
          ctx.chat.id,
          loaderMessage.message_id,
          BotMessages.START_MESSAGE_GROUP_REGISTER
        );
        return;
      }

      const usageGuide = BotMessages.USAGE_GUIDE.replace("{bot_username}", () =>
        escapeMarkdownV2(ctx.me.username)
      );
      const messageText = BotMessages.START_MESSAGE_EXISTING.replace(
        "{first_name}",
        () => escapeMarkdownV2(ctx.from!.first_name)
      ).replace("{usage_guide}", () => usageGuide);

      const deepLinkUrl = `https://t.me/${ctx.me.username}?startgroup=true`;
      const keyboard = new InlineKeyboard().url("➕ Add to Group", deepLinkUrl);

      await ctx.api.editMessageText(
        ctx.chat.id,
        loaderMessage.message_id,
        messageText,
        {
          parse_mode: "MarkdownV2",
          reply_markup: keyboard,
        }
      );
      return;
    }

    // Create new user
    await ctx.trpc.user.createUser({
      userId: ctx.from.id,
      firstName: ctx.from!.first_name,
      lastName: ctx.from.last_name || null,
      userName: ctx.from.username || null,
      phoneNumber: null,
    });

    if (startArg === "register") {
      await ctx.api.editMessageText(
        ctx.chat.id,
        loaderMessage.message_id,
        BotMessages.START_MESSAGE_GROUP_REGISTER
      );
      return;
    }

    const usageGuide = BotMessages.USAGE_GUIDE.replace("{bot_username}", () =>
      escapeMarkdownV2(ctx.me.username)
    );
    const messageText = BotMessages.START_MESSAGE_PRIVATE.replace(
      "{first_name}",
      () => escapeMarkdownV2(ctx.from!.first_name)
    ).replace("{usage_guide}", () => usageGuide);

    const deepLinkUrl = `https://t.me/${ctx.me.username}?startgroup=true`;
    const keyboard = new InlineKeyboard().url("➕ Add to Group", deepLinkUrl);

    await ctx.api.editMessageText(
      ctx.chat.id,
      loaderMessage.message_id,
      messageText,
      {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      }
    );
  } catch (error) {
    console.error("Error in start command:", error);
    await ctx.api.editMessageText(
      ctx.chat.id,
      loaderMessage.message_id,
      BotMessages.ERROR_USER_CHECK_FAILED
    );
  }
});

userFeature.command("help", async (ctx) => {
  await ctx.replyWithChatAction("typing");

  const usageGuide = BotMessages.USAGE_GUIDE.replace("{bot_username}", () =>
    escapeMarkdownV2(ctx.me.username)
  );
  const messageText = BotMessages.HELP_MESSAGE.replace(
    "{usage_guide}",
    usageGuide
  );

  await ctx.reply(messageText, {
    parse_mode: "MarkdownV2",
    message_thread_id: ctx.message?.message_thread_id,
  });
});

userFeature.command("cancel", async (ctx) => {
  await ctx.replyWithChatAction("typing");

  await ctx.reply(BotMessages.SUCCESS_OPERATION_CANCELLED, {
    message_thread_id: ctx.message?.message_thread_id,
  });
});
