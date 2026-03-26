import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { BotMessages } from "./messages.js";
import { env } from "../env.js";
import { ChatUtils } from "../utils/chat.js";

export const groupFeature = new Composer<BotContext>();

groupFeature.command("start", async (ctx, next) => {
  if (ctx.chat.type === "private") return next();
  const messageThreadId = ctx.message?.message_thread_id;

  // Auto-register the user if they don't exist yet, then add them to the group
  if (ctx.from) {
    try {
      try {
        await ctx.trpc.user.getUser({ userId: ctx.from.id });
      } catch (err: unknown) {
        if ((err as any)?.code === "NOT_FOUND") {
          await ctx.trpc.user.createUser({
            userId: ctx.from.id,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name || null,
            userName: ctx.from.username || null,
            phoneNumber: null,
          });
        } else {
          throw err;
        }
      }

      await ctx.trpc.chat.addMember({
        chatId: ctx.chat.id,
        userId: ctx.from.id,
      });
    } catch {
      // Silent failure if user is already a member or other error
    }
  }

  if (messageThreadId) {
    try {
      await ctx.trpc.chat.updateChat({
        chatId: ctx.chat.id,
        threadId: messageThreadId,
      });
    } catch {
      // Silent failure
    }
  }

  const chatContext = ChatUtils.createChatContext(ctx.chat.id, ctx.chat.type);
  const url = ChatUtils.createMiniAppUrl(
    env.MINI_APP_DEEPLINK,
    ctx.me.username,
    chatContext,
    "compact"
  );

  const keyboard = new InlineKeyboard().url("🍌 Banana Splitz", url);

  const pinMessage = await ctx.reply(BotMessages.START_MESSAGE_GROUP, {
    reply_markup: keyboard,
    parse_mode: "MarkdownV2",
    message_thread_id: messageThreadId,
  });

  try {
    await ctx.api.pinChatMessage(ctx.chat.id, pinMessage.message_id);
  } catch {
    // Ignore if pinning fails
  }
});

groupFeature.command("pin", async (ctx) => {
  const messageThreadId = ctx.message?.message_thread_id;

  const chatContext = ChatUtils.createChatContext(ctx.chat.id, ctx.chat.type);
  const url = ChatUtils.createMiniAppUrl(
    env.MINI_APP_DEEPLINK,
    ctx.me.username,
    chatContext,
    "compact"
  );

  const keyboard = new InlineKeyboard().url("🍌 Banana Splitz", url);

  const pinMessage = await ctx.reply(BotMessages.PIN_MESSAGE, {
    reply_markup: keyboard,
    message_thread_id: messageThreadId,
  });

  try {
    await ctx.api.pinChatMessage(ctx.chat.id, pinMessage.message_id);
  } catch {
    const instruction = BotMessages.PIN_MANUAL_INSTRUCTION.replace(
      "{bot_username}",
      ctx.me.username
    );
    await ctx.api.sendMessage(ctx.chat.id, instruction, {
      reply_to_message_id: pinMessage.message_id,
      message_thread_id: messageThreadId,
    });
  }
});

groupFeature.command("set_topic", async (ctx, next) => {
  if (ctx.chat.type === "private") return next();
  const messageThreadId = ctx.message?.message_thread_id;

  if (!messageThreadId || !ChatUtils.isForumChat(ctx.chat)) {
    return ctx.reply(BotMessages.ERROR_TOPIC_ONLY, {
      message_thread_id: messageThreadId,
    });
  }

  try {
    await ctx.trpc.chat.updateChat({
      chatId: ctx.chat.id,
      threadId: messageThreadId,
    });
    await ctx.reply(BotMessages.SUCCESS_TOPIC_SET, {
      message_thread_id: messageThreadId,
    });
  } catch (error) {
    console.error("Error setting topic:", error);
    await ctx.reply(BotMessages.ERROR_TOPIC_SET_FAILED, {
      message_thread_id: messageThreadId,
    });
  }
});

groupFeature.command("summary", async (ctx) => {
  if (ctx.chat.type === "private") {
    return ctx.reply(BotMessages.ERROR_SUMMARY_GROUP_ONLY);
  }

  const messageThreadId = ctx.message?.message_thread_id;

  const progressMessage = await ctx.reply(BotMessages.SUMMARY_IN_PROGRESS, {
    message_thread_id: messageThreadId,
  });

  try {
    const result = await ctx.trpc.telegram.sendGroupReminderMessage({
      chatId: ctx.chat.id.toString(),
    });

    try {
      await ctx.api.deleteMessage(ctx.chat.id, progressMessage.message_id);
    } catch {
      // Ignore if deletion fails
    }

    if (result.messageId === null) {
      const reasonMessage = BotMessages.SUMMARY_NO_MESSAGE.replace(
        "{reason}",
        result.reason || "Unknown reason"
      );
      await ctx.reply(reasonMessage, {
        message_thread_id: messageThreadId,
      });
    }
  } catch (error) {
    console.error("Error generating summary:", error);
    try {
      await ctx.api.deleteMessage(ctx.chat.id, progressMessage.message_id);
    } catch {
      // Ignore if deletion fails
    }
    await ctx.reply(BotMessages.ERROR_SUMMARY_FAILED, {
      message_thread_id: messageThreadId,
    });
  }
});
