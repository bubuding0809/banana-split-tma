import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatScope } from "../../middleware/chatScope.js";

export const inputSchema = z.object({
  chatId: z
    .union([z.string(), z.number()])
    .transform((val) => Number(val))
    .pipe(z.number()),
  userId: z
    .union([z.string(), z.number()])
    .transform((val) => Number(val))
    .pipe(z.number()),
});

export const removeMemberHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  return db.chat.update({
    where: { id: input.chatId },
    data: { members: { disconnect: { id: input.userId } } },
  });
};

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    assertChatScope(ctx.session, input.chatId);
    return removeMemberHandler(input, ctx.db);
  });
