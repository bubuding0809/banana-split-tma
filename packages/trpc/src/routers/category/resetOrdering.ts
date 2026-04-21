import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
});
const outputSchema = z.object({ ok: z.literal(true) });

export const resetOrderingHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  await db.chatCategoryOrdering.deleteMany({
    where: { chatId: input.chatId },
  });
  return { ok: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return resetOrderingHandler(input, ctx.db);
  });
