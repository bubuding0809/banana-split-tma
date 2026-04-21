import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@dko/database";
import { BASE_CATEGORIES } from "@repo/categories";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
  emoji: z
    .string()
    .min(1, "Emoji required")
    .max(8, "Emoji must be a single grapheme"),
  title: z.string().trim().min(1, "Title required").max(16, "Title too long"),
});

const outputSchema = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  kind: z.literal("custom"),
});

export const createChatCategoryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  createdById: bigint
): Promise<z.infer<typeof outputSchema>> => {
  // Reject collisions against both existing customs in this chat AND the
  // built-in base titles — users expect "Food" to always mean the base Food
  // category, not a custom override with the same label.
  const normalized = input.title.trim().toLowerCase();
  if (BASE_CATEGORIES.some((c) => c.title.toLowerCase() === normalized)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A standard category with this title already exists",
    });
  }
  const existing = await db.chatCategory.findFirst({
    where: {
      chatId: input.chatId,
      title: { equals: input.title, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A category with this title already exists in this chat",
    });
  }

  // The DB unique index on (chatId, title) is case-sensitive while our
  // app-level check above is case-insensitive. Two concurrent requests with
  // differently-cased titles can both pass the app check and race into a
  // P2002 unique-constraint violation here — surface it as CONFLICT.
  let row;
  try {
    row = await db.$transaction(async (tx) => {
      const created = await tx.chatCategory.create({
        data: {
          chatId: input.chatId,
          emoji: input.emoji,
          title: input.title,
          createdById,
        },
      });

      // If the chat has an existing custom order, prepend the new tile so it
      // appears at the top of the picker. Otherwise do nothing: default
      // ordering (base then custom-by-createdAt) already places the new tile
      // at the end — acceptable for chats that haven't customized.
      const orderingCount = await tx.chatCategoryOrdering.count({
        where: { chatId: input.chatId },
      });
      if (orderingCount > 0) {
        const agg = await tx.chatCategoryOrdering.aggregate({
          where: { chatId: input.chatId },
          _min: { sortOrder: true },
        });
        const nextSort = (agg._min.sortOrder ?? 0) - 1;
        await tx.chatCategoryOrdering.create({
          data: {
            chatId: input.chatId,
            categoryKey: `chat:${created.id}`,
            sortOrder: nextSort,
            hidden: false,
          },
        });
      }

      return created;
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
    id: `chat:${row.id}`,
    emoji: row.emoji,
    title: row.title,
    kind: "custom",
  };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    const userId = ctx.session.user?.id;
    if (typeof userId === "undefined" || userId === null) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing user id" });
    }
    return createChatCategoryHandler(
      input,
      ctx.db,
      typeof userId === "bigint" ? userId : BigInt(userId)
    );
  });
