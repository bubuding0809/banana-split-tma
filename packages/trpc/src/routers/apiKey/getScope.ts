import { z } from "zod";
import { protectedProcedure } from "../../trpc.js";

const outputSchema = z.union([
  z.object({
    scoped: z.literal(false),
  }),
  z.object({
    scoped: z.literal(true),
    chatId: z.number(),
    chatTitle: z.string(),
  }),
]);

export default protectedProcedure
  .output(outputSchema)
  .query(async ({ ctx }) => {
    const { authType, chatId } = ctx.session;

    if (authType !== "chat-api-key" || chatId === null) {
      return { scoped: false as const };
    }

    // Fetch chat title for the scoped chat
    const chat = await ctx.db.chat.findUnique({
      where: { id: chatId },
      select: { title: true },
    });

    return {
      scoped: true as const,
      chatId: Number(chatId),
      chatTitle: chat?.title ?? "Unknown Chat",
    };
  });
