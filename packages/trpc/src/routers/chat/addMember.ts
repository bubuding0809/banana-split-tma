import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, publicProcedure } from "../../trpc.js";
import { ChatType } from "@dko/database";

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

export default publicProcedure
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
    return addMemberHandler(input, ctx.db);
  });
