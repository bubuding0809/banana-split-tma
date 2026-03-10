import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatScope } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number(),
  userId: z.number(),
});

export const hasMemberHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    select: { members: { where: { id: input.userId } } },
  });

  return Boolean(chat?.members.length);
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    assertChatScope(ctx.session, input.chatId);
    return hasMemberHandler(input, ctx.db);
  });
