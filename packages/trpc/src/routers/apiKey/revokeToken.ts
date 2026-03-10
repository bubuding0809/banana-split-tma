import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  tokenId: z.string().uuid(),
});

const outputSchema = z.object({
  success: z.boolean(),
});

export const revokeTokenHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  userId?: number
) => {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User must be authenticated via Telegram",
    });
  }

  const bigUserId = BigInt(userId);

  // Verify chat membership via implicit many-to-many
  const chat = await db.chat.findFirst({
    where: {
      id: input.chatId,
      members: { some: { id: bigUserId } },
    },
  });

  if (!chat) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this chat",
    });
  }

  // Find the active token belonging to this chat
  const token = await db.chatApiKey.findFirst({
    where: {
      id: input.tokenId,
      chatId: input.chatId,
      revokedAt: null,
    },
  });

  if (!token) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Token not found or already revoked",
    });
  }

  // Soft delete - consistent with existing revoke pattern
  await db.chatApiKey.update({
    where: { id: token.id },
    data: { revokedAt: new Date() },
  });

  return { success: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return revokeTokenHandler(input, ctx.db, ctx.session.user?.id);
  });
