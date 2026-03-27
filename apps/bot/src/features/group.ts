import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { BotMessages } from "./messages.js";
import { env } from "../env.js";
import { ChatUtils } from "../utils/chat.js";

import { handleAgentMessage } from "./agent.js";

export const groupFeature = new Composer<BotContext>();

groupFeature.command("start", async (ctx, next) => {
  if (ctx.chat.type === "private") return next();
  const messageThreadId = ctx.message?.message_thread_id;

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

groupFeature.on("message", async (ctx, next) => {
  if (ctx.chat.type === "private") return next();

  const botUsername = ctx.me.username;
  if (!botUsername) return next();

  // Handle both standard text messages and media captions
  const text = ctx.message.text || ctx.message.caption || "";

  // Telegram natively identifies mentions in entities
  const entities = ctx.message.entities || ctx.message.caption_entities || [];

  // Check if mentioned explicitly in entities
  const hasMentionEntity = entities.some(
    (entity) =>
      entity.type === "mention" &&
      text
        .substring(entity.offset, entity.offset + entity.length)
        .toLowerCase() === `@${botUsername.toLowerCase()}`
  );

  // Fallback regex matching just in case
  const mentionRegex = new RegExp(`@${botUsername}\\b`, "i");
  const isMentioned = hasMentionEntity || mentionRegex.test(text);

  // Check if it's a direct reply to one of the bot's messages
  const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;

  // If the message explicitly starts with a slash, let other command handlers process it
  if (text.startsWith("/")) return next();

  if (isMentioned || isReplyToBot) {
    // Strip all mentions of the bot (case-insensitive, global) to get the actual command payload
    const payload = text
      .replace(new RegExp(`@${botUsername}\\b`, "gi"), "")
      .trim();

    // Provide a fallback message if the user just tagged the bot (e.g., with an image) or replied without text
    let finalPayload = payload;
    if (!finalPayload) {
      if (ctx.message.photo || ctx.message.video || ctx.message.document) {
        finalPayload = "I sent a media file/image.";
      } else {
        finalPayload = "Hello!"; // Default trigger to wake the bot up if they just send "@botname"
      }
    }

    await handleAgentMessage(ctx, finalPayload);
    return;
  }

  return next();
});
