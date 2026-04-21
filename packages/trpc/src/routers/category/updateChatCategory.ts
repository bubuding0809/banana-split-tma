import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@dko/database";
import { BASE_CATEGORIES } from "@repo/categories";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatCategoryId: z.string().uuid(),
  emoji: z.string().min(1).max(8).optional(),
  title: z.string().trim().min(1).max(16).optional(),
});

const outputSchema = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  kind: z.literal("custom"),
});

export const updateChatCategoryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<{ chatId: bigint } & z.infer<typeof outputSchema>> => {
  // DB lookup runs before assertChatAccess because chatId is not in input.
  // Low-risk UUID-existence oracle: v4 uuids are unguessable.
  const row = await db.chatCategory.findUnique({
    where: { id: input.chatCategoryId },
  });
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });

  if (input.title !== undefined) {
    // Reject collisions against the built-in base titles first — a user
    // renaming their custom to "Food" would otherwise shadow the built-in.
    const normalized = input.title.trim().toLowerCase();
    if (BASE_CATEGORIES.some((c) => c.title.toLowerCase() === normalized)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A standard category with this title already exists",
      });
    }
    const clash = await db.chatCategory.findFirst({
      where: {
        chatId: row.chatId,
        id: { not: row.id },
        title: { equals: input.title, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (clash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A category with this title already exists in this chat",
      });
    }
  }

  // The DB unique index on (chatId, title) is case-sensitive while our
  // app-level check above is case-insensitive. Two concurrent requests with
  // differently-cased titles can both pass the app check and race into a
  // P2002 unique-constraint violation here — surface it as CONFLICT.
  let updated;
  try {
    updated = await db.chatCategory.update({
      where: { id: row.id },
      data: {
        emoji: input.emoji ?? undefined,
        title: input.title ?? undefined,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A category with this title already exists in this chat",
      });
    }
    throw err;
  }

  return {
    chatId: updated.chatId,
    id: `chat:${updated.id}`,
    emoji: updated.emoji,
    title: updated.title,
    kind: "custom",
  };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    const { chatId, ...out } = await updateChatCategoryHandler(input, ctx.db);
    await assertChatAccess(ctx.session, ctx.db, chatId);
    return out;
  });
