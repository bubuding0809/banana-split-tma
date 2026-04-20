import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({ chatCategoryId: z.string().uuid() });
const outputSchema = z.object({ ok: z.literal(true) });

export const deleteChatCategoryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<{ chatId: bigint } & z.infer<typeof outputSchema>> => {
  const row = await db.chatCategory.findUnique({
    where: { id: input.chatCategoryId },
  });
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });

  const fullId = `chat:${row.id}`;
  await db.$transaction(async (tx) => {
    await tx.expense.updateMany({
      where: { chatId: row.chatId, categoryId: fullId },
      data: { categoryId: null },
    });
    await tx.chatCategory.delete({ where: { id: row.id } });
  });

  return { chatId: row.chatId, ok: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    const { chatId, ...out } = await deleteChatCategoryHandler(input, ctx.db);
    await assertChatAccess(ctx.session, ctx.db, chatId);
    return out;
  });
