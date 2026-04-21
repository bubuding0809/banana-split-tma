import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertKnownKey } from "@repo/categories";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const itemSchema = z.object({
  categoryKey: z.string().min(1),
  sortOrder: z.number().int(),
  hidden: z.boolean(),
});

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
  items: z.array(itemSchema).min(1, "items cannot be empty"),
});

const outputSchema = z.object({ ok: z.literal(true) });

export const setOrderingHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  // Look up the chat's known custom-category ids so we can validate
  // `chat:<uuid>` keys against real rows (not just UUID shape).
  const customs = await db.chatCategory.findMany({
    where: { chatId: input.chatId },
    select: { id: true },
  });
  const knownCustomIds = new Set(customs.map((c) => c.id));

  // Reject any unknown key before we touch the DB.
  for (const it of input.items) {
    try {
      assertKnownKey(it.categoryKey, knownCustomIds);
    } catch (err) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          err instanceof Error
            ? err.message
            : `Unknown category key: ${it.categoryKey}`,
      });
    }
  }

  // Reject duplicate categoryKeys in a single payload.
  const seen = new Set<string>();
  for (const it of input.items) {
    if (seen.has(it.categoryKey)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Duplicate category key in items: ${it.categoryKey}`,
      });
    }
    seen.add(it.categoryKey);
  }

  await db.$transaction(async (tx) => {
    await tx.chatCategoryOrdering.deleteMany({
      where: { chatId: input.chatId },
    });
    if (input.items.length > 0) {
      await tx.chatCategoryOrdering.createMany({
        data: input.items.map((it) => ({
          chatId: input.chatId,
          categoryKey: it.categoryKey,
          sortOrder: it.sortOrder,
          hidden: it.hidden,
        })),
      });
    }
  });

  return { ok: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return setOrderingHandler(input, ctx.db);
  });
