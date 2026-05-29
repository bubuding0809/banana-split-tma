import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number(),
});

export const getAllByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const rows = await db.debtTransfer.findMany({
    where: {
      OR: [{ sourceChatId: input.chatId }, { targetChatId: input.chatId }],
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      createdAt: true,
      updatedAt: true,
      debtorId: true,
      creditorId: true,
      creatorId: true,
      sourceChatId: true,
      targetChatId: true,
      amount: true,
      currency: true,
      description: true,
      sourceChat: { select: { title: true } },
      targetChat: { select: { title: true } },
    },
  });

  return rows.map((t) => {
    // Direction is relative to the chat being viewed: "out" when this chat
    // is the source (debt removed here), "in" when it is the target.
    const isSource = Number(t.sourceChatId) === input.chatId;
    const direction: "out" | "in" = isSource ? "out" : "in";
    const counterpartChatId = isSource ? t.targetChatId : t.sourceChatId;
    const counterpartChatTitle = isSource
      ? t.targetChat.title
      : t.sourceChat.title;

    return {
      id: t.id,
      date: t.date,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      debtorId: Number(t.debtorId),
      creditorId: Number(t.creditorId),
      creatorId: Number(t.creatorId),
      sourceChatId: Number(t.sourceChatId),
      targetChatId: Number(t.targetChatId),
      amount: Number(t.amount),
      currency: t.currency,
      description: t.description,
      direction,
      counterpartChatId: Number(counterpartChatId),
      counterpartChatTitle,
    };
  });
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return getAllByChatHandler(input, ctx.db);
  });
