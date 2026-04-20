import { z } from "zod";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { BASE_CATEGORIES } from "./base.js";
import { buildClassifierPrompt } from "./prompt.js";
import type { ChatCategoryRow } from "./types.js";

const CLASSIFY_TIMEOUT_MS = 3000;
export const CONFIDENCE_THRESHOLD = 0.4;

export async function classifyCategory(args: {
  description: string;
  chatCategories: ChatCategoryRow[];
  model: LanguageModel;
  signal?: AbortSignal;
}): Promise<{ categoryId: string; confidence: number } | null> {
  if (args.signal?.aborted) return null;
  if (!args.description.trim()) return null;

  const customIds = args.chatCategories.map((c) => `chat:${c.id}` as const);
  const allowedIds = [...BASE_CATEGORIES.map((c) => c.id), ...customIds];

  const enumValues = [...allowedIds, "none"] as unknown as [
    string,
    ...string[],
  ];
  const schema = z.object({
    categoryId: z.enum(enumValues),
    confidence: z.number().min(0).max(1),
  });

  const prompt = buildClassifierPrompt({
    description: args.description,
    allowed: [
      ...BASE_CATEGORIES.map((c) => ({
        id: c.id,
        emoji: c.emoji,
        title: c.title,
        keywords: c.keywords,
      })),
      ...args.chatCategories.map((c) => ({
        id: `chat:${c.id}`,
        emoji: c.emoji,
        title: c.title,
      })),
    ],
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    args.signal?.addEventListener("abort", onAbort);

    try {
      const { object } = await generateObject({
        model: args.model,
        schema,
        prompt,
        abortSignal: controller.signal,
      });

      if (object.categoryId === "none") return null;
      if (object.confidence < CONFIDENCE_THRESHOLD) return null;
      return { categoryId: object.categoryId, confidence: object.confidence };
    } finally {
      clearTimeout(timeout);
      args.signal?.removeEventListener("abort", onAbort);
    }
  } catch {
    return null;
  }
}
