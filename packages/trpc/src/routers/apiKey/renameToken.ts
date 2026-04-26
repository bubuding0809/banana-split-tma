import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  tokenId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(40, "Name too long"),
});

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const renameTokenHandler = async (
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
      message: "Token not found",
    });
  }

  const updated = await db.chatApiKey.update({
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
    return renameTokenHandler(input, ctx.db, ctx.session.user?.id);
  });
