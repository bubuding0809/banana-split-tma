import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { ChatType } from "@dko/database";
import { createGroupReminderScheduleHandler } from "../aws/createGroupReminderSchedule.js";

export const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  chatTitle: z.string(),
  chatType: z.string(),
  chatPhoto: z.string().nullish(),
});

export const outputSchema = z.object({
  id: z.preprocess((arg) => String(arg), z.string()),
  title: z.string(),
  photo: z.string(),
  type: z.nativeEnum(ChatType),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    // Validate chat type
    if (!Object.values(ChatType).includes(input.chatType as ChatType)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid chat type: ${input.chatType}. Must be one of: ${Object.values(ChatType).join(", ")}`,
      });
    }

    // Check if chat already exists
    const existingChat = await db.chat.findUnique({
      where: { id: input.chatId },
    });
    if (existingChat) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Chat with ID ${input.chatId} already exists`,
      });
    }

    const chat = await db.chat.create({
      data: {
        id: input.chatId,
        title: input.chatTitle,
        type: input.chatType as ChatType,
        ...(input.chatPhoto && { photo: input.chatPhoto }),
      },
    });

    return chat;
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    // Handle Prisma unique constraint violations
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint failed")
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Chat with ID ${input.chatId} already exists`,
      });
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create chat",
    });
  } finally {
    // Create a default group reminder schedule for the chat
    try {
      await createGroupReminderScheduleHandler({
        chatId: input.chatId.toString(),
        dayOfWeek: "sunday",
        time: "9:00pm",
        timezone: "Asia/Singapore",
        enabled: true,
      });
    } catch (error) {
      console.error("Failed to create group reminder schedule:", error);
    }
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/chat",
      contentTypes: ["application/json"],
      tags: ["chat"],
      summary: "Create a new chat",
      description: "Create a new chat with the provided information",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return createChatHandler(input, ctx.db);
  });
