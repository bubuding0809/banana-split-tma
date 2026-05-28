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
  // Lets the client decide which snackbar to render: a confirmation, a
  // "we couldn't auto-pick" nudge, an "auto-classify hit a snag" warning,
  // or a quiet "you're typing too fast" no-op.
  status: z.enum(["match", "no_match", "error", "rate_limited"]),
});

// Inlined rather than imported from @repo/agent to avoid a cycle:
// @repo/agent already depends on @dko/trpc, so @dko/trpc cannot depend on @repo/agent.
// Keep the default model in sync with @repo/agent's getAgentModel() default.
function getModel(): LanguageModel {
  const modelName = process.env.AGENT_MODEL || "gemini-3.1-flash-lite";
  return google(modelName) as unknown as LanguageModel;
}

export const suggestCategoryHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void }
): Promise<z.infer<typeof outputSchema>> => {
  const rows = await db.chatCategory.findMany({
    where: { chatId: input.chatId },
    select: { id: true, chatId: true, emoji: true, title: true },
  });
  const result = await classifyCategory({
    description: input.description,
    chatCategories: rows,
    model: getModel(),
    logger,
  });
  if (result.kind === "match") {
    return {
      categoryId: result.categoryId,
      confidence: result.confidence,
      status: "match",
    };
  }
  if (result.kind === "error") {
    return { categoryId: null, status: "error" };
  }
  return { categoryId: null, status: "no_match" };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    const userId = ctx.session.user?.id;
    const key = `suggest:${String(userId ?? "anon")}`;
    if (!takeToken(key, 20, 60_000)) {
      ctx.log.warn(
        { user_id: userId?.toString() },
        "category.suggest.rateLimited"
      );
      return { categoryId: null, status: "rate_limited" };
    }
    return suggestCategoryHandler(input, ctx.db, ctx.log);
  });
