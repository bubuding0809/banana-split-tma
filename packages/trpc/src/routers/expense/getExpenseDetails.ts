import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { Prisma } from "@dko/database";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  expenseId: z.string(),
});

const getExpenseDetailsHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  session: {
    authType:
      | "superadmin"
      | "chat-api-key"
      | "user-api-key"
      | "telegram"
      | "agent";
    chatId: bigint | null;
  }
) => {
  const expense = await db.expense.findUnique({
    where: {
      id: input.expenseId,
    },
    include: {
      participants: true,
      creator: true,
      payer: true,
      shares: true,
      chat: true,
    },
  });

  if (expense) {
    await assertChatAccess(session, db, expense.chatId);
  }

  if (!expense) {
    return null;
  }

  // Drop Prisma-level BigInt fields the client doesn't consume.
  // superjson preserves bigint end-to-end, and React 19's component
  // render tracing crashes on any bigint it walks in props.
  const {
    telegramMessageId,
    telegramUpdateBumpMessageIds,
    creator,
    payer,
    chat,
    ...rest
  } = expense;
  void telegramMessageId;
  void telegramUpdateBumpMessageIds;

  return {
    ...rest,
    chatId: Number(expense.chatId),
    creatorId: Number(expense.creatorId),
    payerId: Number(expense.payerId),
    amount: Number(expense.amount),
    categoryId: expense.categoryId ?? null,
    creator: { ...creator, id: Number(creator.id) },
    payer: { ...payer, id: Number(payer.id) },
    chat: {
      ...chat,
      id: Number(chat.id),
      threadId: chat.threadId === null ? null : Number(chat.threadId),
    },
    participants: expense.participants.map((p) => ({
      ...p,
      id: Number(p.id),
    })),
    shares: expense.shares.map((s) => ({
      ...s,
      userId: Number(s.userId),
      amount: Number(s.amount),
    })),
  };
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getExpenseDetailsHandler(input, ctx.db, ctx.session);
  });
