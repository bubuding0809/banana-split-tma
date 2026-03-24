import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import {
  BotMessages,
  GROUP_JOIN_MESSAGE,
  GROUP_INSTRUCTION,
  MIGRATION_MESSAGE_GROUP,
} from "./messages.js";
import { ChatUtils } from "../utils/chat.js";
import { env } from "../env.js";

export const botEventsFeature = new Composer<BotContext>();

botEventsFeature.on("my_chat_member", async (ctx) => {
  const chat = ctx.myChatMember.chat;

  if (chat.type !== "group" && chat.type !== "supergroup") {
    return;
  }

  const oldStatus = ctx.myChatMember.old_chat_member.status;
  const newStatus = ctx.myChatMember.new_chat_member.status;

  const wasNotMember = oldStatus === "left" || oldStatus === "kicked";
  const isNowMember =
    newStatus === "member" ||
    newStatus === "administrator" ||
    newStatus === "restricted";

  if (!wasNotMember || !isNowMember) {
    return;
  }

  console.log(`Bot added to group: ${chat.id}`);

  try {
    let chatPhotoUrl = undefined;
    const fullChat = await ctx.api.getChat(chat.id);
    if (fullChat.photo) {
      const file = await ctx.api.getFile(fullChat.photo.big_file_id);
      chatPhotoUrl = file.file_path;
    }

    let chatExists = false;
    try {
      await ctx.trpc.chat.getChat({ chatId: chat.id });
      chatExists = true;
    } catch (e: any) {
      if (e?.code !== "NOT_FOUND") {
        throw e;
      }
    }

    if (!chatExists) {
      await ctx.trpc.chat.createChat({
        chatId: chat.id,
        chatTitle: chat.title || `Group:${chat.id}`,
        chatType: chat.type,
        chatPhoto: chatPhotoUrl || undefined,
      });
    }

    await ctx.reply(GROUP_JOIN_MESSAGE);

    await ctx.reply(GROUP_INSTRUCTION, {
      parse_mode: "MarkdownV2",
    });
  } catch (error) {
    console.error("Failed to process my_chat_member event:", error);
    await ctx.reply("❌ Failed to initialize chat");
  }
});

botEventsFeature.on("message:migrate_to_chat_id", async (ctx) => {
  const oldChatId = ctx.chat.id;
  const newChatId = ctx.message.migrate_to_chat_id;

  try {
    await ctx.trpc.chat.migrateChat({
      oldChatId,
      newChatId,
    });

    const chatContext = ChatUtils.createChatContext(newChatId, "supergroup");
    const url = ChatUtils.createMiniAppUrl(
      env.MINI_APP_DEEPLINK || "",
      ctx.me.username,
      chatContext,
      "compact"
    );

    const keyboard = new InlineKeyboard().url("🍌 Banana Splitz", url);

    await ctx.api.sendMessage(newChatId, MIGRATION_MESSAGE_GROUP, {
      reply_markup: keyboard,
      parse_mode: "MarkdownV2",
    });
  } catch (error) {
    console.error("Failed to migrate chat:", error);
  }
});
