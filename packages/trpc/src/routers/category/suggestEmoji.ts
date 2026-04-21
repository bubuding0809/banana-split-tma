import { z } from "zod";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { protectedProcedure } from "../../trpc.js";
import { takeToken } from "../../utils/rateLimit.js";

const inputSchema = z.object({
  title: z.string().trim().min(1).max(32),
});

const outputSchema = z.object({
  emoji: z.string().nullable(),
});

// Inlined (not imported from @repo/agent) to avoid a cycle:
// @repo/agent already depends on @dko/trpc.
function getModel(): LanguageModel {
  const modelName = process.env.AGENT_MODEL || "gemini-3.1-flash-lite-preview";
  return google(modelName) as unknown as LanguageModel;
}

const SUGGEST_TIMEOUT_MS = 3000;

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    const userId = ctx.session.user?.id;
    const key = `suggestEmoji:${String(userId ?? "anon")}`;
    // Same 20 requests / minute window as suggestCategory — users editing
    // a name in real time will debounce into this; keep it generous enough
    // not to deny the happy path but tight enough to prevent runaway.
    if (!takeToken(key, 20, 60_000)) {
      return { emoji: null };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SUGGEST_TIMEOUT_MS);
      try {
        const { object } = await generateObject({
          model: getModel(),
          schema: z.object({
            emoji: z
              .string()
              .describe(
                "A single emoji character that best represents the category title. Exactly one emoji, no surrounding text."
              ),
          }),
          prompt: `Return the single most representative emoji for the expense category named "${input.title}". Respond with exactly one emoji — no words, no punctuation. Examples: "Food" -> 🍜, "Travel" -> ✈️, "Bali Trip" -> 🏝️, "Birthday" -> 🎂.`,
          abortSignal: controller.signal,
        });
        return { emoji: object.emoji || null };
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // Gemini unavailable, rate-limited, or timed out — the UI handles
      // null by leaving the user's current emoji in place.
      return { emoji: null };
    }
  });
