import type { TrpcClient } from "./client.js";

export type ChatIdInput = string | number | undefined;

function parseChatId(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error("chatId must be a number");
  }
  return parsed;
}

/**
 * Resolve chatId: use explicit value if provided, otherwise check API key scope.
 * Throws if no chatId available.
 */
export async function resolveChatId(
  trpc: TrpcClient,
  chatId?: ChatIdInput
): Promise<number> {
  if (chatId !== undefined && chatId !== "") {
    return parseChatId(chatId);
  }

  const scope = await trpc.apiKey.getScope.query();
  if (scope.scoped && scope.chatId) {
    return Number(scope.chatId);
  }

  throw new Error("chatId is required (API key is not chat-scoped)");
}
