import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@dko/database";
import { Db, protectedProcedure } from "../../trpc.js";
import { deleteExpenseMessagesHandler } from "../telegram/deleteExpenseNotificationMessage.js";
import { Telegram } from "telegraf";
import { assertChatScope } from "../../middleware/chatScope.js";

export const inputSchema = z.object({
  expenseId: z.string(),
});

export const outputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const deleteExpenseHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram,
  session: {
    authType: "superadmin" | "chat-api-key" | "telegram";
    chatId: bigint | null;
  }
) => {
  try {
    // First, fetch the expense to get Telegram message IDs
    const expense = await db.expense.findUnique({
      where: { id: input.expenseId },
      select: {
        id: true,
        description: true,
        amount: true,
        chatId: true,
        telegramMessageId: true,
        telegramUpdateBumpMessageIds: true,
      },
    });

    if (!expense) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Expense not found",
      });
    }

    assertChatScope(session, expense.chatId);

    // Attempt to delete Telegram messages (best effort - don't fail if this fails)
    try {
      await deleteExpenseMessagesHandler(
        {
          chatId: Number(expense.chatId),
          telegramMessageId: expense.telegramMessageId,
          telegramUpdateBumpMessageIds: expense.telegramUpdateBumpMessageIds,
        },
        teleBot
      );
    } catch (telegramError) {
      // Log the error but continue with database deletion
      console.error(
        "Error deleting Telegram messages for expense:",
        telegramError
      );
    }

    // Delete the expense from database
    await db.expense.delete({
      where: {
        id: input.expenseId,
      },
    });

    return {
      success: true,
      message: "Expense deleted successfully",
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    // Handle Prisma record not found error
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
      message: "Failed to delete expense",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "DELETE",
      path: "/expense/{expenseId}",
      tags: ["expense"],
      summary: "Delete an expense",
      description: "Delete an expense by ID.",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return deleteExpenseHandler(input, ctx.db, ctx.teleBot, ctx.session);
  });
