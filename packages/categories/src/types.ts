export type CategoryKind = "base" | "custom";

export interface BaseCategory {
  id: `base:${string}`;
  emoji: string;
  title: string;
  keywords: readonly string[];
}

export interface ChatCategoryRow {
  id: string; // uuid as stored in ChatCategory.id (no prefix)
  emoji: string;
  title: string;
  chatId: bigint;
}

export interface ResolvedCategory {
  id: string; // "base:<id>" or "chat:<uuid>"
  emoji: string;
  title: string;
  kind: CategoryKind;
}
