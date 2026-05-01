import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import {
  GROUP_JOIN_MESSAGE,
  GROUP_INSTRUCTION,
  MIGRATION_MESSAGE_GROUP,
} from "./messages.js";
import { ChatUtils } from "../utils/chat.js";
import { env } from "../env.js";

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

  console.log(`Bot added to group: ${chat.id}`);

  try {
    let chatPhotoUrl: string | undefined;
    const fullChat = await ctx.api.getChat(chat.id);
    if (fullChat.photo) {
      const file = await ctx.api.getFile(fullChat.photo.big_file_id);
      chatPhotoUrl = file.file_path;
    }

    let existingChat: Awaited<ReturnType<typeof ctx.trpc.chat.getChat>> | null =
      null;
    try {
      existingChat = await ctx.trpc.chat.getChat({ chatId: chat.id });
    } catch (e: unknown) {
      if ((e as any)?.code !== "NOT_FOUND") {
        throw e;
      }
    }

    if (existingChat) {
      // Either: this chat was created by a prior add (re-add path)
      // or: it was just created by migrateChat (migratedFromChatId is set).
      // In both cases skip the welcome — the user has been greeted before,
      // or the migrate handler will deliver its own dedicated message.
      console.log(
        `my_chat_member: chat ${chat.id} already exists (migrated=${existingChat.migratedFromChatId !== null}); skipping welcome`
      );
      return next();
    }

    await ctx.trpc.chat.createChat({
      chatId: chat.id,
      chatTitle: chat.title || `Group:${chat.id}`,
      chatType: chat.type,
      chatPhoto: chatPhotoUrl || undefined,
    });

    await ctx.reply(GROUP_JOIN_MESSAGE);

    await ctx.reply(GROUP_INSTRUCTION, {
      parse_mode: "MarkdownV2",
    });
  } catch (error) {
    console.error("Failed to process my_chat_member event:", error);
    await ctx.reply("❌ Failed to initialize chat");
  }
});

async function runMigration(
  ctx: BotContext,
  oldChatId: number,
  newChatId: number
): Promise<void> {
  const result = await ctx.trpc.chat.migrateChat({ oldChatId, newChatId });

  if (!result.migrated) {
    // Idempotent no-op: the other side's event already migrated. Stay quiet.
    return;
  }

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
}

botEventsFeature.on("message:migrate_to_chat_id", async (ctx) => {
  const oldChatId = ctx.chat.id;
  const newChatId = ctx.message.migrate_to_chat_id;
  await runMigration(ctx, oldChatId, newChatId);
});

botEventsFeature.on("message:migrate_from_chat_id", async (ctx) => {
  const newChatId = ctx.chat.id;
  const oldChatId = ctx.message.migrate_from_chat_id;
  await runMigration(ctx, oldChatId, newChatId);
});
