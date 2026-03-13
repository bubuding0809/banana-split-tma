import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number(),
  currency: z
    .string()
    .min(3)
    .max(3, { message: "Currency code must be 3 characters long" })
    .optional(),
});

export const getSettlementByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const settlements = await db.settlement.findMany({
    where: {
      chatId: input.chatId,
      ...(input.currency ? { currency: input.currency } : {}),
    },
  });

  return settlements.map((settlement) => ({
    ...settlement,
    senderId: Number(settlement.senderId),
    receiverId: Number(settlement.receiverId),
    chatId: Number(settlement.chatId),
    amount: Number(settlement.amount),
  }));
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return getSettlementByChatHandler(input, ctx.db);
  });
