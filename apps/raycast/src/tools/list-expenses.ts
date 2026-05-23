import { runTool, withToolErrors } from "../lib/tools/run-tool";
import { listExpenses } from "@bananasplitz/api-ops";

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
    return runTool("list-expenses", input, (trpc) =>
      listExpenses(trpc, {
        chatId: input.chatId,
        currency: input.currency,
        category: input.category,
      }),
    );
  });
}
