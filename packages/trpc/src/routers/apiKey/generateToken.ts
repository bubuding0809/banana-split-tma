import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
});

const outputSchema = z.object({
  rawKey: z.string(),
  keyPrefix: z.string(),
});

export const generateTokenHandler = async (
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

  // Generate new key: bsk_ + 48 random bytes as base64url
  const randomBytes = crypto.randomBytes(48);
  const rawKey = `bsk_${randomBytes.toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 8);

  // Hash the key for storage
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  // Store in database
  await db.chatApiKey.create({
    data: {
      keyHash,
      keyPrefix,
      chatId: input.chatId,
      createdById: bigUserId,
    },
  });

  return { rawKey, keyPrefix };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return generateTokenHandler(input, ctx.db, ctx.session.user?.id);
  });
