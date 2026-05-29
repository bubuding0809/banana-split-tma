import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

export const inputSchema = z.object({
  transferId: z.string(),
});

export const deleteTransferHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const transfer = await db.debtTransfer.findUnique({
    where: { id: input.transferId },
    select: { id: true },
  });

  if (!transfer) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Transfer not found",
    });
  }

  // Deleting the row reverses the transfer: the balance engine recomputes
  // source/target balances on the next read with this transfer gone.
  await db.debtTransfer.delete({ where: { id: input.transferId } });

  return { success: true, id: input.transferId };
};

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    const transfer = await ctx.db.debtTransfer.findUnique({
      where: { id: input.transferId },
      select: { sourceChatId: true, targetChatId: true },
    });

    if (!transfer) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Transfer not found" });
    }

    // Cross-group action: the caller must be authorized for both chats.
    await assertChatAccess(ctx.session, ctx.db, transfer.sourceChatId);
    await assertChatAccess(ctx.session, ctx.db, transfer.targetChatId);

    return deleteTransferHandler(input, ctx.db);
  });
