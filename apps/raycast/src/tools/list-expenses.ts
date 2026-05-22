import { BASE_CATEGORIES } from "@repo/categories";
import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { resolveChatId } from "../lib/tools/scope";

type Input = {
  /** Numeric chat ID (optional if API key is chat-scoped) */
  chatId?: string;
  /** Filter by 3-letter currency code */
  currency?: string;
  /** Category id (base:<slug> or chat:<uuid>). Use "none" for uncategorized. */
  category?: string;
};

/** List expenses in a chat with optional filters. */
export default async function tool(input: Input) {
  return withToolErrors("list-expenses", input, async () => {
    return runTool("list-expenses", input, async (trpc) => {
      const chatId = await resolveChatId(trpc, input.chatId);

      const categoryMap = new Map<string, { emoji: string; title: string }>();
      for (const b of BASE_CATEGORIES) {
        categoryMap.set(b.id, { emoji: b.emoji, title: b.title });
      }
      try {
        const result = await trpc.category.listByChat.query({ chatId });
        for (const c of result.items.filter((item) => item.kind === "custom")) {
          categoryMap.set(c.id, { emoji: c.emoji, title: c.title });
        }
      } catch {
        // category labels are best-effort
      }

      let expenses = await trpc.expense.getExpenseByChat.query({
        chatId,
        currency: input.currency,
      });

      if (input.category) {
        const target = input.category;
        expenses = expenses.filter((e: { categoryId?: string | null }) => (e.categoryId ?? "none") === target);
      }

      return expenses.map((e: { categoryId?: string | null; [key: string]: unknown }) => {
        const cat = e.categoryId ? categoryMap.get(e.categoryId) : null;
        const categoryLabel = cat ? `${cat.emoji} ${cat.title}` : null;
        return { ...e, categoryLabel };
      });
    });
  });
}
