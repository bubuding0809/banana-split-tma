import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@dko/database";
import { Db, protectedProcedure } from "../../trpc.js";

export const inputSchema = z.object({
  settlementId: z.string(),
});

export const outputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const deleteSettlementHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    await db.settlement.delete({
      where: {
        id: input.settlementId,
      },
    });

    return {
      success: true,
      message: "Settlement deleted successfully",
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
        message: "Settlement not found",
      });
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to delete settlement",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "DELETE",
      path: "/settlement/{settlementId}",
      tags: ["settlement"],
      summary: "Delete a settlement",
      description: "Delete a settlement by ID.",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return deleteSettlementHandler(input, ctx.db);
  });
