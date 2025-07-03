import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({ chatId: z.number() });

export const getMembersHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    select: { members: true },
  });

  return chat?.members;
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getMembersHandler(input, ctx.db);
  });
