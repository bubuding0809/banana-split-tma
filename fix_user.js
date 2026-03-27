const fs = require("fs");
let code = fs.readFileSync("apps/bot/src/features/user.ts", "utf8");

const importRegex = /import \{ Composer, InlineKeyboard \} from "grammy";/;
code = code.replace(
  importRegex,
  'import { Composer, InlineKeyboard, Keyboard } from "grammy";'
);

const insertStart = `  const startArg = ctx.match;

  if (startArg && startArg.startsWith("ADD_MEMBER")) {
    const groupIdStr = startArg.replace("ADD_MEMBER", "");
    ctx.session.addMemberGroupId = groupIdStr;

    let chatTitle = "the group";
    try {
      const chatInfo = await ctx.api.getChat(groupIdStr);
      if ("title" in chatInfo) {
        chatTitle = chatInfo.title || "the group";
      }
    } catch (e) {
      console.error("Could not fetch chat info for", groupIdStr);
    }

    const keyboard = new Keyboard()
      .requestUsers(BotMessages.ADD_MEMBER_SELECT_BUTTON, 1, {
        max_quantity: 10,
        request_name: true,
        request_username: true,
      })
      .row()
      .text(BotMessages.ADD_MEMBER_CANCEL_BUTTON)
      .resized();

    const messageText = BotMessages.ADD_MEMBER_START_MESSAGE.replace(
      "{group_title}",
      escapeMarkdownV2(chatTitle)
    );

    await ctx.reply(messageText, {
      reply_markup: keyboard,
      parse_mode: "MarkdownV2",
    });
    return;
  }

  await ctx.replyWithChatAction("typing");`;

code = code.replace(
  `  const startArg = ctx.match;

  await ctx.replyWithChatAction("typing");`,
  insertStart
);

fs.writeFileSync("apps/bot/src/features/user.ts", code);
