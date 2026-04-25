import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  createdById: z.number().transform((val) => BigInt(val)),
});

const outputSchema = z.object({
  rawKey: z.string(),
  keyPrefix: z.string(),
});

export const generateApiKeyHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  authType: string
) => {
  // Only superadmin can generate keys
  if (authType !== "superadmin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only superadmin can generate API keys",
    });
  }

  // Verify chat exists
  const chat = await db.chat.findUnique({ where: { id: input.chatId } });
  if (!chat) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Chat ${input.chatId} not found`,
    });
  }

  // Verify user exists
  const user = await db.user.findUnique({ where: { id: input.createdById } });
  if (!user) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `User ${input.createdById} not found`,
    });
  }

  // Revoke any existing active key for this chat
  await db.chatApiKey.updateMany({
    where: {
      chatId: input.chatId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

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
      // TODO(settings-redesign Task 22): decide whether this superadmin
      // procedure stays (then accept an optional `name` input) or is
      // removed in favor of generateToken. Until then the placeholder
      // mirrors the migration's date-based fallback.
      name: `Token · ${new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" })}`,
      chatId: input.chatId,
      createdById: input.createdById,
    },
  });

  return { rawKey, keyPrefix };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return generateApiKeyHandler(input, ctx.db, ctx.session.authType);
  });
