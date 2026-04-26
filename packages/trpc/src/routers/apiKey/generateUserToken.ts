import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40, "Name too long"),
});

const outputSchema = z.object({
  rawKey: z.string(),
  keyPrefix: z.string(),
});

export const generateUserTokenHandler = async (
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

  const randomBytes = crypto.randomBytes(48);
  const rawKey = `usk_${randomBytes.toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 8);
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  await db.userApiKey.create({
    data: {
      keyHash,
      keyPrefix,
      name: trimmedName,
      userId: bigUserId,
    },
  });

  return { rawKey, keyPrefix };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return generateUserTokenHandler(input, ctx.db, ctx.session.user?.id);
  });
