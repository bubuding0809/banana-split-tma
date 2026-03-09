import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatScope } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number(),
});

export const getAllSettlementsByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const settlements = await db.settlement.findMany({
    where: {
      chatId: input.chatId,
      // No currency filtering - return all settlements regardless of currency
    },
    orderBy: {
      date: "desc",
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
    assertChatScope(ctx.session, input.chatId);
    return getAllSettlementsByChatHandler(input, ctx.db);
  });
