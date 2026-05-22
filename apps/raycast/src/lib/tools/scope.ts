import type { BananaTrpcClient } from "../trpc";

/**
 * Resolve chatId: use explicit value if provided, otherwise check API key scope.
 * Mirrors apps/cli/src/scope.ts.
 */
export async function resolveChatId(trpc: BananaTrpcClient, chatId?: number | string): Promise<number> {
  if (chatId !== undefined && chatId !== "") {
    const parsed = typeof chatId === "number" ? chatId : Number(chatId);
    if (Number.isNaN(parsed)) throw new Error("chatId must be a number");
    return parsed;
  }

  const scope = await trpc.apiKey.getScope.query();
  if (scope.scoped && scope.chatId) return Number(scope.chatId);
  throw new Error("chatId is required (API key is not chat-scoped)");
}
