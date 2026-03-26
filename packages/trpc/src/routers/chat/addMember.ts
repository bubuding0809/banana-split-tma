import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { ChatType } from "@dko/database";
import { assertChatAccess } from "../../middleware/chatScope.js";

export const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  userId: z.number().transform((val) => BigInt(val)),
});

export const outputSchema = z.object({
  id: z.preprocess((arg) => String(arg), z.string()),
  title: z.string(),
  photo: z.string(),
  type: z.nativeEnum(ChatType),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const addMemberHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    // Check if chat exists
    const chat = await db.chat.findUnique({
      where: { id: input.chatId },
      include: { members: true },
    });
    if (!chat) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Chat with ID ${input.chatId} not found`,
      });
    }

    // Check if user exists
    const user = await db.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `User with ID ${input.userId} not found`,
      });
    }

    // Check if user is already a member
    const isAlreadyMember = chat.members.some(
      (member) => member.id === input.userId
    );
    if (isAlreadyMember) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `User ${input.userId} is already a member of chat ${input.chatId}`,
      });
    }

    // Add member to chat
    return db.chat.update({
      where: { id: input.chatId },
      data: { members: { connect: { id: input.userId } } },
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to add member to chat",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "PUT",
      path: "/chat/{chatId}/members/{userId}",
      contentTypes: ["application/json"],
      tags: ["chat"],
      summary: "Add member to chat",
      description: "Add a user as a member to the specified chat",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    // We intentionally bypass assertChatAccess here because a user needs to be
    // able to add themselves to a chat even if they are not yet a member
    // (e.g. when opening the TMA from an inline button in a group).

    if (ctx.session.authType === "superadmin") {
      return addMemberHandler(input, ctx.db);
    }

    if (ctx.session.authType === "chat-api-key") {
      if (ctx.session.chatId !== input.chatId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This API key does not have access to the requested chat",
        });
      }
    } else {
      // "telegram" or "user-api-key"
      if (
        !ctx.session.user ||
        Number(ctx.session.user.id) !== Number(input.userId)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only add yourself to a chat",
        });
      }
    }

    // 1. If we have parsedInitData (TMA user), verify chat_instance
    if (ctx.session.parsedInitData?.chat_instance) {
      // TMA users have a cryptographically verified chat_instance in their payload.
      // We look up the chat by ID and compare its ID and type against the payload context.
      const chat = await ctx.db.chat.findUnique({
        where: { id: input.chatId },
        select: { id: true, type: true },
      });

      if (!chat) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Chat with ID ${input.chatId} not found`,
        });
      }

      // Re-create the chat_instance hash the exact same way the bot created it for the deeplink
      const chatContext = {
        chat_id: Number(chat.id),
        chat_type: chat.type === "private" ? "p" : "g",
      };
      const expectedInstance = Buffer.from(
        JSON.stringify(chatContext),
        "utf-8"
      ).toString("base64");

      // If the chat_instance in the verified initData payload doesn't match the URL parameters,
      // it means the user clicked a leaked link outside of the actual chat.
      if (ctx.session.parsedInitData.chat_instance !== expectedInstance) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Unauthorized: You must open the Mini App from within the Telegram group.",
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

    return addMemberHandler(input, ctx.db);
  });
