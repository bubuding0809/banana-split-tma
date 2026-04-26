import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@dko/database";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

export const inputSchema = z.object({
  expenseId: z.string(),
  // Telegram message IDs are 32-bit ints in the API but we store as BigInt
  // for consistency with other telegramMessageId columns. Accept a number
  // here and let the handler widen to BigInt before persisting.
  telegramMessageId: z.number().int().positive(),
});

export const outputSchema = z.object({
  success: z.boolean(),
});

export const attachTelegramMessageHandler = async (
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
  try {
    const expense = await db.expense.findUnique({
      where: { id: input.expenseId },
      select: { chatId: true },
    });

    if (!expense) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Expense not found",
      });
    }

    await assertChatAccess(session, db, expense.chatId);

    await db.expense.update({
      where: { id: input.expenseId },
      data: { telegramMessageId: BigInt(input.telegramMessageId) },
    });

    return { success: true };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Expense not found",
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to attach Telegram message ID to expense",
    });
  }
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return attachTelegramMessageHandler(input, ctx.db, ctx.session);
  });
