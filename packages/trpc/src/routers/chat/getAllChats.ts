import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  excludeTypes: z
    .array(z.enum(["private", "group", "supergroup", "channel", "sender"]))
    .optional()
    .default([])
    .describe("Chat types to exclude from the results"),
});

const outputSchema = z.array(
  z.object({
    id: z.number().describe("Chat ID"),
    title: z.string().describe("Chat title/name"),
    type: z.enum(["private", "group", "supergroup", "channel", "sender"]),
    baseCurrency: z.string().describe("Default currency for the chat"),
    createdAt: z.date().describe("When the chat was created"),
    updatedAt: z.date().describe("When the chat was last updated"),
  })
);

export const getAllChatsHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const { excludeTypes } = input;

  const chats = await db.chat.findMany({
    where: {
      type: {
        notIn: excludeTypes,
      },
    },
    select: {
      id: true,
      title: true,
      type: true,
      baseCurrency: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return chats.map((chat) => ({
    ...chat,
    id: Number(chat.id),
  }));
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/chat/all",
      tags: ["chat"],
      summary: "Get all chats",
      description:
        "Retrieves all chats with optional filtering. Useful for bulk operations like setting up recurring reminders.",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return getAllChatsHandler(input, ctx.db);
  });
