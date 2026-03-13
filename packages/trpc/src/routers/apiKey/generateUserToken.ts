import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { Db, protectedProcedure } from "../../trpc.js";

const outputSchema = z.object({
  rawKey: z.string(),
  keyPrefix: z.string(),
});

export const generateUserTokenHandler = async (db: Db, userId?: number) => {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User must be authenticated via Telegram",
    });
  }

  const bigUserId = BigInt(userId);

  // Generate new key: usk_ + 48 random bytes as base64url
  const randomBytes = crypto.randomBytes(48);
  const rawKey = `usk_${randomBytes.toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 8);

  // Hash the key for storage
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  // Store in database
  await db.userApiKey.create({
    data: {
      keyHash,
      keyPrefix,
      userId: bigUserId,
    },
  });

  return { rawKey, keyPrefix };
};

export default protectedProcedure
  .output(outputSchema)
  .mutation(async ({ ctx }) => {
    return generateUserTokenHandler(ctx.db, ctx.session.user?.id);
  });
