import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { classifyCategory } from "@repo/categories";
import { google } from "@ai-sdk/google";
import { takeToken } from "../../utils/rateLimit.js";
import type { LanguageModel } from "ai";

const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
  description: z.string().trim().min(1).max(120),
});

const outputSchema = z.object({
  categoryId: z.string().nullable(),
  confidence: z.number().optional(),
});

function getModel(): LanguageModel {
  const modelName = process.env.AGENT_MODEL || "gemini-2.0-flash-lite";
  return google(modelName) as unknown as LanguageModel;
}

export const suggestCategoryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
): Promise<z.infer<typeof outputSchema>> => {
  const rows = await db.chatCategory.findMany({
    where: { chatId: input.chatId },
    select: { id: true, chatId: true, emoji: true, title: true },
  });
  const result = await classifyCategory({
    description: input.description,
    chatCategories: rows,
    model: getModel(),
  });
  return result
    ? { categoryId: result.categoryId, confidence: result.confidence }
    : { categoryId: null };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    const userId = ctx.session.user?.id;
    const key = `suggest:${String(userId ?? "anon")}`;
    if (!takeToken(key, 20, 60_000)) {
      console.warn("category.suggest rate limit hit", { userId });
      return { categoryId: null };
    }
    return suggestCategoryHandler(input, ctx.db);
  });
