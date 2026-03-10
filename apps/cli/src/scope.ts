import type { TrpcClient } from "./client.js";

/**
 * Resolve chatId: use explicit value if provided, otherwise check API key scope.
 * Throws if no chatId available.
 */
export async function resolveChatId(
  trpc: TrpcClient,
  chatIdFlag?: string
): Promise<number> {
  if (chatIdFlag) {
    const parsed = Number(chatIdFlag);
    if (Number.isNaN(parsed)) throw new Error("--chat-id must be a number");
    return parsed;
  }

  const scope = await trpc.apiKey.getScope.query();
  if (scope.scoped && scope.chatId) return Number(scope.chatId);
  throw new Error("--chat-id is required (API key is not chat-scoped)");
}
