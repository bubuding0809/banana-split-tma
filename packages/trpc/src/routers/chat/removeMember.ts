import { z } from "zod";
import { Db, publicProcedure } from "../../trpc.js";

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

export default publicProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    return removeMemberHandler(input, ctx.db);
  });
