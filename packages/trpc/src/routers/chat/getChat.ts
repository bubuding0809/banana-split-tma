import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { TRPCError } from "@trpc/server";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({ chatId: z.number() });

export const getChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    include: { members: true },
  });

  if (!chat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
  }

  return {
    ...chat,
    threadId: chat?.threadId ? Number(chat.threadId) : undefined,
    debtSimplificationEnabled: chat?.debtSimplificationEnabled ?? false,
    members:
      chat?.members.map((m) => ({
        ...m,
        id: Number(m.id),
      })) ?? [],
  };
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId, ctx.teleBot);
    return getChatHandler(input, ctx.db);
  });
