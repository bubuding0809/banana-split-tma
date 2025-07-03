import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@dko/database";
import { Db, protectedProcedure } from "../../trpc.js";

export const inputSchema = z.object({
  expenseId: z.string(),
});

export const outputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const deleteExpenseHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    await db.expense.delete({
      where: {
        id: input.expenseId,
      },
      select: {
        id: true,
        description: true,
        amount: true,
        chatId: true,
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
    return deleteExpenseHandler(input, ctx.db);
  });
