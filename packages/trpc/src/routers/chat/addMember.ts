import { z } from "zod";
import { Db, publicProcedure } from "../../trpc";


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

export const addMemberHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  return db.chat.update({
    where: { id: input.chatId },
    data: { members: { connect: { id: input.userId } } },
  });
};

export default publicProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    return addMemberHandler(input, ctx.db);
  });
