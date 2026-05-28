import { z } from "zod";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { BASE_CATEGORIES } from "./base.js";
import { buildClassifierPrompt } from "./prompt.js";
import type { ChatCategoryRow } from "./types.js";

const CLASSIFY_TIMEOUT_MS = 3000;
export const CONFIDENCE_THRESHOLD = 0.4;

export interface ClassifyLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

export type ClassifyOutcome =
  | { kind: "match"; categoryId: string; confidence: number }
  | { kind: "no_match" }
  | { kind: "error"; message: string };

export async function classifyCategory(args: {
  description: string;
  chatCategories: ChatCategoryRow[];
  model: LanguageModel;
  signal?: AbortSignal;
  logger?: ClassifyLogger;
}): Promise<ClassifyOutcome> {
  if (args.signal?.aborted) return { kind: "no_match" };
  if (!args.description.trim()) return { kind: "no_match" };

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

      if (object.categoryId === "none") return { kind: "no_match" };
      if (object.confidence < CONFIDENCE_THRESHOLD) return { kind: "no_match" };
      return {
        kind: "match",
        categoryId: object.categoryId,
        confidence: object.confidence,
      };
    } finally {
      clearTimeout(timeout);
      args.signal?.removeEventListener("abort", onAbort);
    }
  } catch (err) {
    // Aborts are not user-visible errors — surface them as no_match so the UI
    // doesn't flash a "something went wrong" toast when the user just navigated
    // away or kept typing.
    if (
      args.signal?.aborted ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      return { kind: "no_match" };
    }
    const message = err instanceof Error ? err.message : String(err);
    args.logger?.warn(
      {
        err_message: message,
        err_name: err instanceof Error ? err.name : undefined,
      },
      "categories.classify.error"
    );
    return { kind: "error", message };
  }
}
