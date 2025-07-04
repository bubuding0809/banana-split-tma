import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number(),
});

export const getSettlementByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const settlements = await db.settlement.findMany({
    where: {
      chatId: input.chatId,
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
    return getSettlementByChatHandler(input, ctx.db);
  });
