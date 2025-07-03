import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({ chatId: z.number() });

export const getChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    include: { members: true },
  });

  return {
    ...chat,
    threadId: chat?.threadId ? Number(chat.threadId) : undefined,
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
    return getChatHandler(input, ctx.db);
  });
