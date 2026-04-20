import { BASE_CATEGORIES } from "./base.js";
import type { ChatCategoryRow, ResolvedCategory } from "./types.js";

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
    return { id, emoji: row.emoji, title: row.title, kind: "custom" };
  }

  return null;
}
