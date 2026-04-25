import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  tokenId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(40, "Name too long"),
});

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const renameUserTokenHandler = async (
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

  // Schema validates min(1) after trim, but the handler can also be called
  // directly from tests/internal code that bypasses zod — guard explicitly.
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Name is required" });
  }

  const bigUserId = BigInt(userId);

  // Scope to this user — never let anyone rename a token they don't own.
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
      message: "Token not found",
    });
  }

  const updated = await db.userApiKey.update({
    where: { id: token.id },
    data: { name: trimmedName },
    select: { id: true, name: true },
  });

  return updated;
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return renameUserTokenHandler(input, ctx.db, ctx.session.user?.id);
  });
