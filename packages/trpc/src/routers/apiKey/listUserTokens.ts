import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

const outputSchema = z.array(
  z.object({
    id: z.string(),
    keyPrefix: z.string(),
    createdAt: z.string(),
  })
);

export const listUserTokensHandler = async (db: Db, userId?: number) => {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User must be authenticated via Telegram",
    });
  }

  const bigUserId = BigInt(userId);

  const tokens = await db.userApiKey.findMany({
    where: {
      userId: bigUserId,
      revokedAt: null,
    },
    select: {
      id: true,
      keyPrefix: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return tokens.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
  }));
};

export default protectedProcedure
  .output(outputSchema)
  .query(async ({ ctx }) => {
    return listUserTokensHandler(ctx.db, ctx.session.user?.id);
  });
