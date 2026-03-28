import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@dko/database";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

export const inputSchema = z.object({
  settlementId: z.string(),
});

export const outputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const deleteSettlementHandler = async (
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
    // Lookup settlement to enforce scope
    const settlement = await db.settlement.findUnique({
      where: { id: input.settlementId },
      select: { chatId: true },
    });

    if (!settlement) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Settlement not found",
      });
    }

    await assertChatAccess(session, db, settlement.chatId);

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
    return deleteSettlementHandler(input, ctx.db, ctx.session);
  });
