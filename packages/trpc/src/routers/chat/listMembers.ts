import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({ chatId: z.number() });

const outputSchema = z.array(
  z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    username: z.string().nullable(),
  })
);

export const listMembersHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    select: {
      members: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
        orderBy: { firstName: "asc" },
      },
    },
  });

  if (!chat) return [];

  return chat.members.map((m) => ({
    id: m.id.toString(),
    firstName: m.firstName,
    lastName: m.lastName,
    username: m.username,
  }));
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return listMembersHandler(input, ctx.db);
  });
