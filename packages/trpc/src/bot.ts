import { Telegraf } from "telegraf";

/**
 * Creates and configures the Telegram bot with proper event handlers.
 *
 * IMPORTANT: Welcome messages are sent ONLY via the `my_chat_member` event.
 * Do NOT add handlers for `message` with `new_chat_members` for welcome messages,
 * as Telegram fires both events when a bot is added to a group, which causes
 * duplicate welcome messages.
 */
export const createBot = (botToken: string) => {
  const bot = new Telegraf(botToken);

  // Handle bot being added to a group or supergroup.
  // `my_chat_member` fires exactly once when the bot's own membership status changes.
  // This is the correct event to use instead of `message.new_chat_members` which
  // would fire alongside `my_chat_member` and cause duplicate welcome messages.
  bot.on("my_chat_member", async (ctx) => {
    const { new_chat_member, old_chat_member } = ctx.myChatMember;
    const chat = ctx.chat;

    const wasNotMember =
      old_chat_member.status === "left" ||
      old_chat_member.status === "kicked" ||
      old_chat_member.status === "restricted";

    const isNowMember =
      new_chat_member.status === "member" ||
      new_chat_member.status === "administrator";

    // Only send welcome message when bot transitions from non-member to member/admin
    // in a group or supergroup chat
    if (
      wasNotMember &&
      isNowMember &&
      (chat.type === "group" || chat.type === "supergroup")
    ) {
      await ctx.reply(
        "🎉 Hello friends, I am here to help your split your expenses!"
      );
      await ctx.reply(`Use /start@${ctx.botInfo.username} to start me!`);
    }
  });

  return bot;
};
