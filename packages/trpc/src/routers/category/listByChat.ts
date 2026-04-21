import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { BASE_CATEGORIES } from "@repo/categories";

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
});

const itemSchema = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  kind: z.enum(["base", "custom"]),
  hidden: z.boolean(),
  sortOrder: z.number(),
});

const outputSchema = z.object({
  items: z.array(itemSchema),
  hasCustomOrder: z.boolean(),
});

type OutItem = z.infer<typeof itemSchema>;

export const listByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  const [customRows, orderingRows] = await Promise.all([
    db.chatCategory.findMany({
      where: { chatId: input.chatId },
      orderBy: { createdAt: "asc" },
    }),
    db.chatCategoryOrdering.findMany({
      where: { chatId: input.chatId },
    }),
  ]);

  const hasCustomOrder = orderingRows.length > 0;

  const baseTiles: OutItem[] = BASE_CATEGORIES.map((c, idx) => ({
    id: c.id,
    emoji: c.emoji,
    title: c.title,
    kind: "base" as const,
    hidden: false,
    sortOrder: idx,
  }));

  const customTiles: OutItem[] = customRows.map((r, idx) => ({
    id: `chat:${r.id}`,
    emoji: r.emoji,
    title: r.title,
    kind: "custom" as const,
    hidden: false,
    sortOrder: BASE_CATEGORIES.length + idx,
  }));

  const allTiles = [...baseTiles, ...customTiles];

  if (!hasCustomOrder) {
    return {
      items: allTiles.sort((a, b) => a.sortOrder - b.sortOrder),
      hasCustomOrder: false,
    };
  }

  const orderByKey = new Map(
    orderingRows.map((r) => [r.categoryKey, r] as const)
  );
  const maxKnownSort = orderingRows.reduce(
    (m, r) => (r.sortOrder > m ? r.sortOrder : m),
    -Infinity
  );
  let fallbackCursor = Number.isFinite(maxKnownSort) ? maxKnownSort + 1 : 0;

  const applied: OutItem[] = allTiles.map((t) => {
    const row = orderByKey.get(t.id);
    if (row) {
      return { ...t, sortOrder: row.sortOrder, hidden: row.hidden };
    }
    return { ...t, sortOrder: fallbackCursor++, hidden: false };
  });

  applied.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.kind !== b.kind) return a.kind === "base" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  return { items: applied, hasCustomOrder: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return listByChatHandler(input, ctx.db);
  });
