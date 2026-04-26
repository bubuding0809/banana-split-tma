import { Composer, InlineKeyboard, Keyboard } from "grammy";
import { BotContext } from "../types.js";
import { TRPCError } from "@trpc/server";
import { BotMessages } from "./messages.js";
import { escapeMarkdownV2 } from "../utils/markdown.js";
import { ChatUtils } from "../utils/chat.js";
import { env } from "../env.js";

export const userFeature = new Composer<BotContext>();

userFeature.command("start", async (ctx, next) => {
  if (!ctx.from) return next();

  const startArg = ctx.match;

  if (startArg && startArg.startsWith("ADD_MEMBER")) {
    const groupIdStr = startArg.replace("ADD_MEMBER", "");
    ctx.session.addMemberGroupId = groupIdStr;

    let chatTitle = "the group";
    try {
      const chatInfo = await ctx.api.getChat(groupIdStr);
      if ("title" in chatInfo) {
        chatTitle = chatInfo.title || "the group";
      }
    } catch {
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

  await ctx.replyWithChatAction("typing");

  const loaderMessage = await ctx.reply(BotMessages.START_LOADER_MESSAGE, {
    message_thread_id: ctx.message?.message_thread_id,
  });

  try {
    let exists = false;
    try {
      await ctx.trpc.user.getUser({ userId: ctx.from.id });
      exists = true;
    } catch (err: any) {
      if (err?.code === "NOT_FOUND") {
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

userFeature.hears(BotMessages.ADD_MEMBER_CANCEL_BUTTON, async (ctx) => {
  ctx.session.addMemberGroupId = undefined;
  await ctx.reply(BotMessages.SUCCESS_OPERATION_CANCELLED, {
    reply_markup: { remove_keyboard: true },
  });
});

userFeature.on("message:users_shared", async (ctx, next) => {
  if (ctx.message.users_shared.request_id !== 1) {
    return next();
  }

  const groupIdStr = ctx.session.addMemberGroupId;
  if (!groupIdStr) {
    await ctx.reply(
      "Session expired. Please start the add member process again.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
    return;
  }

  // Membership guard: confirm the requester is actually in the target group
  // before letting them add anyone. Fail-closed: any API error (bot kicked
  // from group, transient failure, etc.) treats the requester as not-a-member.
  let requesterMember;
  try {
    requesterMember = await ctx.api.getChatMember(groupIdStr, ctx.from!.id);
  } catch (err) {
    console.warn("Membership guard: getChatMember failed", {
      groupIdStr,
      userId: ctx.from!.id,
      err,
    });
    ctx.session.addMemberGroupId = undefined;
    await ctx.reply(BotMessages.ADD_MEMBER_NOT_A_MEMBER, {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  // A "restricted" user with is_member: false has been restricted AND has
  // already left the chat — not a current member. Reject alongside left/kicked.
  const isNotCurrentMember =
    requesterMember.status === "left" ||
    requesterMember.status === "kicked" ||
    (requesterMember.status === "restricted" && !requesterMember.is_member);

  if (isNotCurrentMember) {
    ctx.session.addMemberGroupId = undefined;
    await ctx.reply(BotMessages.ADD_MEMBER_NOT_A_MEMBER, {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  // Compute chat title + mini-app URL once, used by both per-user DMs
  // (Task 4) and the back-to-app inline button on the success message
  // (this task). We don't persist title in session — see spec § Source
  // of chatTitle for why we re-fetch instead.
  let chatTitle = "the group";
  try {
    const chatInfo = await ctx.api.getChat(groupIdStr);
    if ("title" in chatInfo && chatInfo.title) {
      chatTitle = chatInfo.title;
    }
  } catch {
    // Fall through with default — the back-to-app button still works,
    // it just reads "Open the group in app".
  }

  const miniAppCommand = ChatUtils.createChatContext(
    BigInt(groupIdStr),
    "supergroup"
  );
  const miniAppUrl = ChatUtils.createMiniAppUrl(
    env.MINI_APP_DEEPLINK,
    ctx.me.username,
    miniAppCommand
  );

  const users = ctx.message.users_shared.users;
  const successList: string[] = [];
  const failedList: string[] = [];

  for (const user of users) {
    try {
      try {
        await ctx.trpc.user.createUser({
          userId: user.user_id,
          firstName: user.first_name || "",
          lastName: user.last_name || null,
          userName: user.username || null,
          phoneNumber: null,
        });
      } catch (err: unknown) {
        if ((err as any)?.code !== "CONFLICT") {
          throw err;
        }
      }

      await ctx.trpc.chat.addMember({
        chatId: Number(groupIdStr),
        userId: Number(user.user_id),
      });

      successList.push(
        user.first_name || user.username || String(user.user_id)
      );
    } catch (err) {
      console.error("Failed to add member", user.user_id, err);
      failedList.push(user.first_name || user.username || String(user.user_id));
    }
  }

  ctx.session.addMemberGroupId = undefined;

  const resultText = BotMessages.ADD_MEMBER_END_MESSAGE.replace(
    "{success_list}",
    successList.length ? successList.join(", ") : "None"
  ).replace(
    "{failed_list}",
    failedList.length ? failedList.join(", ") : "None"
  );

  // Telegram does not allow combining `remove_keyboard` with an inline
  // keyboard on the same message. Send two messages: first removes the
  // reply-keyboard, second carries the inline button back to the TMA.
  await ctx.reply(resultText, {
    reply_markup: { remove_keyboard: true },
  });

  if (successList.length > 0) {
    const buttonLabel = BotMessages.ADD_MEMBER_OPEN_APP_BUTTON.replace(
      "{chat_title}",
      chatTitle
    );
    await ctx.reply(`✅ ${successList.length} member(s) added.`, {
      reply_markup: new InlineKeyboard().url(buttonLabel, miniAppUrl),
    });
  }
});
