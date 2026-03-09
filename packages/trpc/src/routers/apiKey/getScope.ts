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
    // TODO: Task 3 will add chatId to the session type; cast through unknown for now
    const session = ctx.session as unknown as {
      authType: string;
      chatId: bigint | null;
    };
    const { authType, chatId } = session;

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
