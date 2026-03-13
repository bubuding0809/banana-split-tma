import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  tokenId: z.string().uuid(),
});

const outputSchema = z.object({
  success: z.boolean(),
});

export const revokeUserTokenHandler = async (
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

  // Find the active token belonging to this user
  const token = await db.userApiKey.findFirst({
    where: {
      id: input.tokenId,
      userId: bigUserId,
      revokedAt: null,
    },
  });

  if (!token) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Token not found or already revoked",
    });
  }

  // Soft delete
  await db.userApiKey.update({
    where: { id: token.id },
    data: { revokedAt: new Date() },
  });

  return { success: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return revokeUserTokenHandler(input, ctx.db, ctx.session.user?.id);
  });
