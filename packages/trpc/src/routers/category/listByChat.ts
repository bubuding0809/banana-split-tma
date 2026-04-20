import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { BASE_CATEGORIES, type ResolvedCategory } from "@repo/categories";

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
});

const outputSchema = z.object({
  base: z.array(
    z.object({
      id: z.string(),
      emoji: z.string(),
      title: z.string(),
      kind: z.literal("base"),
    })
  ),
  custom: z.array(
    z.object({
      id: z.string(),
      emoji: z.string(),
      title: z.string(),
      kind: z.literal("custom"),
    })
  ),
});

export const listByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  const rows = await db.chatCategory.findMany({
    where: { chatId: input.chatId },
    orderBy: { createdAt: "asc" },
  });

  const base: Array<ResolvedCategory & { kind: "base" }> = BASE_CATEGORIES.map(
    (c) => ({
      id: c.id,
      emoji: c.emoji,
      title: c.title,
      kind: "base" as const,
    })
  );

  const custom: Array<ResolvedCategory & { kind: "custom" }> = rows.map(
    (r) => ({
      id: `chat:${r.id}`,
      emoji: r.emoji,
      title: r.title,
      kind: "custom" as const,
    })
  );

  return { base, custom };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return listByChatHandler(input, ctx.db);
  });
