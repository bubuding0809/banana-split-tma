import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
});

const outputSchema = z.object({
  keyPrefix: z.string(),
  revoked: z.boolean(),
});

export const revokeApiKeyHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  authType: string
) => {
  // Only superadmin can revoke keys
  if (authType !== "superadmin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only superadmin can revoke API keys",
    });
  }

  // Find active key for this chat
  const activeKey = await db.chatApiKey.findFirst({
    where: {
      chatId: input.chatId,
      revokedAt: null,
    },
  });

  if (!activeKey) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No active API key found for chat ${input.chatId}`,
    });
  }

  // Revoke it
  await db.chatApiKey.update({
    where: { id: activeKey.id },
    data: { revokedAt: new Date() },
  });

  return { keyPrefix: activeKey.keyPrefix, revoked: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return revokeApiKeyHandler(input, ctx.db, ctx.session.authType);
  });
