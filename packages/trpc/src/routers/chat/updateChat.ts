import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { ChatType } from "@dko/database";
import { assertChatAccess } from "../../middleware/chatScope.js";

export const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  threadId: z
    .number()
    .optional()
    .transform((val) => (val ? BigInt(val) : undefined)),
  title: z.string().optional(),
  photo: z.string().optional(),
  type: z.nativeEnum(ChatType).optional(),
  baseCurrency: z.string().optional(),
  debtSimplificationEnabled: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
});

export const outputSchema = z.object({
  id: z.preprocess((arg) => String(arg), z.string()),
  title: z.string(),
  photo: z.string(),
  type: z.nativeEnum(ChatType),
  threadId: z.number().optional(),
  baseCurrency: z.string().optional(),
  debtSimplificationEnabled: z.boolean(),
  notificationsEnabled: z.boolean(),
  updatedAt: z.date(),
});

export const updateChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    // Check if chat exists
    const existingChat = await db.chat.findUnique({
      where: { id: input.chatId },
    });

    if (!existingChat) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Chat with ID ${input.chatId} not found`,
      });
    }

    // Build update data object with only provided fields
    const updateData: {
      threadId?: bigint | null;
      title?: string;
      photo?: string;
      type?: ChatType;
      baseCurrency?: string;
      debtSimplificationEnabled?: boolean;
      notificationsEnabled?: boolean;
    } = {};

    if (input.threadId !== undefined) {
      updateData.threadId = input.threadId;
    }
    if (input.title !== undefined) {
      updateData.title = input.title;
    }
    if (input.photo !== undefined) {
      updateData.photo = input.photo;
    }
    if (input.type !== undefined) {
      updateData.type = input.type;
    }
    if (input.baseCurrency !== undefined) {
      updateData.baseCurrency = input.baseCurrency;
    }
    if (input.debtSimplificationEnabled !== undefined) {
      updateData.debtSimplificationEnabled = input.debtSimplificationEnabled;
    }
    if (input.notificationsEnabled !== undefined) {
      updateData.notificationsEnabled = input.notificationsEnabled;
    }

    const updatedChat = await db.chat.update({
      where: { id: input.chatId },
      data: updateData,
    });

    return {
      ...updatedChat,
      threadId: updatedChat.threadId ? Number(updatedChat.threadId) : undefined,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    // Log the error for debugging
    console.error("Error updating chat:", error);

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to update chat: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "PATCH",
      path: "/chat/{chatId}",
      contentTypes: ["application/json"],
      tags: ["chat"],
      summary: "Update chat information",
      description:
        "Update chat properties including threadId for topic support",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return updateChatHandler(input, ctx.db);
  });
