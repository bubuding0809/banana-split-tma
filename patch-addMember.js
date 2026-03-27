const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "packages",
  "trpc",
  "src",
  "routers",
  "chat",
  "addMember.ts"
);
let code = fs.readFileSync(file, "utf8");

const regexToReplace =
  /\/\/ Verify with Telegram that the user is actually in this chat[\s\S]*?(?=return addMemberHandler\(input, ctx\.db\);)/m;

const replacement = `// 1. If we have parsedInitData (TMA user), verify chat_instance
    if (ctx.session.parsedInitData?.chat_instance) {
      // TMA users have a cryptographically verified chat_instance in their payload.
      // We look up the chat by ID and compare its ID and type against the payload context.
      const chat = await ctx.db.chat.findUnique({
        where: { id: input.chatId },
        select: { id: true, type: true }
      });
      
      if (!chat) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: \`Chat with ID \${input.chatId} not found\`,
        });
      }

      // Re-create the chat_instance hash the exact same way the bot created it for the deeplink
      const chatContext = {
        chat_id: Number(chat.id),
        chat_type: chat.type === "private" ? "p" : "g",
      };
      const expectedInstance = Buffer.from(JSON.stringify(chatContext), "utf-8").toString("base64");
      
      // If the chat_instance in the verified initData payload doesn't match the URL parameters,
      // it means the user clicked a leaked link outside of the actual chat.
      if (ctx.session.parsedInitData.chat_instance !== expectedInstance) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unauthorized: You must open the Mini App from within the Telegram group.",
        });
      }
    } 
    // 2. Fallback to Telegram API verification if no chat_instance (e.g. user API keys, CLI)
    // We skip this check for private chats (where chatId == userId)
    else if (Number(input.chatId) !== Number(input.userId)) {
      try {
        const chatMember = await ctx.teleBot.getChatMember(
          Number(input.chatId),
          Number(input.userId)
        );

        if (chatMember.status === "left" || chatMember.status === "kicked") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "User must be a member of the Telegram group.",
          });
        }
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Could not verify user's membership in this Telegram chat. The bot must be an administrator in the group to verify new members.",
        });
      }
    }

    `;

code = code.replace(regexToReplace, replacement);
fs.writeFileSync(file, code);
