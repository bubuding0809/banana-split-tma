import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import {
  GROUP_JOIN_MESSAGE,
  GROUP_INSTRUCTION,
  MIGRATION_MESSAGE_GROUP,
} from "./messages.js";
import { ChatUtils } from "../utils/chat.js";
import { env } from "../env.js";

const migratedChatIds = new Set<number>();

export const botEventsFeature = new Composer<BotContext>();

botEventsFeature.on("my_chat_member", async (ctx, next) => {
  const chat = ctx.myChatMember.chat;

  if (chat.type !== "group" && chat.type !== "supergroup") {
    return next();
  }

  const oldStatus = ctx.myChatMember.old_chat_member.status;
  const newStatus = ctx.myChatMember.new_chat_member.status;

  const wasNotMember = oldStatus === "left" || oldStatus === "kicked";
  const isNowMember =
    newStatus === "member" ||
    newStatus === "administrator" ||
    newStatus === "restricted";

  if (!wasNotMember || !isNowMember) {
    return next();
  }

  // Wait briefly in case this is a migration race condition where message:migrate_to_chat_id
  // hasn't arrived yet but we're getting the my_chat_member upgrade trigger
  if (chat.type === "supergroup") {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (migratedChatIds.has(chat.id)) {
        break;
      }
    }
  }

  // Skip chats that were just migrated to a supergroup
  if (migratedChatIds.has(chat.id)) {
    migratedChatIds.delete(chat.id);
    console.log(`Skipping my_chat_member for migrated chat ${chat.id}`);
    return next();
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
    } catch (e: unknown) {
      if ((e as any)?.code !== "NOT_FOUND") {
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
    migratedChatIds.add(newChatId);

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
