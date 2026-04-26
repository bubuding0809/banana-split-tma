import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
});

const outputSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    keyPrefix: z.string(),
    createdAt: z.string(),
    createdBy: z.object({
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      username: z.string().nullable(),
    }),
  })
);

export const listTokensHandler = async (
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

  const tokens = await db.chatApiKey.findMany({
    where: {
      chatId: input.chatId,
      revokedAt: null,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return tokens.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
  }));
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    return listTokensHandler(input, ctx.db, ctx.session.user?.id);
  });
