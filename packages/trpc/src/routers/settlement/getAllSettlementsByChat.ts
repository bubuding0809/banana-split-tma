import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

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

  return settlements.map((settlement) => {
    const { telegramMessageId, ...rest } = settlement;
    void telegramMessageId;
    return {
      ...rest,
      senderId: Number(rest.senderId),
      receiverId: Number(rest.receiverId),
      chatId: Number(rest.chatId),
      amount: Number(rest.amount),
    };
  });
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return getAllSettlementsByChatHandler(input, ctx.db);
  });
