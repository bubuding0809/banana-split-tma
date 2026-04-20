import { BASE_CATEGORIES } from "./base.js";
import type { ChatCategoryRow, ResolvedCategory } from "./types.js";

/**
 * Resolve a category id into a display-ready object.
 *
 * - `"base:<slug>"` is looked up against {@link BASE_CATEGORIES}.
 * - `"chat:<uuid>"` is looked up against the provided `chatCategories` rows.
 * - `null`, empty string, and any other format return `null`.
 *
 * The returned `id` preserves the original `"base:"` / `"chat:"` prefix so callers
 * can pass it back into persistence or storage without re-wrapping.
 */
export function resolveCategory(
  id: string | null,
  chatCategories: ChatCategoryRow[]
): ResolvedCategory | null {
  if (!id) return null;

  if (id.startsWith("base:")) {
    const base = BASE_CATEGORIES.find((c) => c.id === id);
    if (!base) return null;
    return { id: base.id, emoji: base.emoji, title: base.title, kind: "base" };
  }

  if (id.startsWith("chat:")) {
    const uuid = id.slice("chat:".length);
    const row = chatCategories.find((c) => c.id === uuid);
    if (!row) return null;
    return {
      id: `chat:${row.id}`,
      emoji: row.emoji,
      title: row.title,
      kind: "custom",
    };
  }

  return null;
}
