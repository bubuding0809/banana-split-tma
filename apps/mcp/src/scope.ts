import type { TrpcClient } from "./client.js";

interface Scope {
  scoped: boolean;
  chatId: number | null;
  chatTitle: string | null;
}

/**
 * Fetches the API key scope from the backend.
 * Chat-scoped keys return { scoped: true, chatId, chatTitle }.
 * Superadmin keys return { scoped: false, chatId: null, chatTitle: null }.
 */
export async function getScope(trpc: TrpcClient): Promise<Scope> {
  try {
    const result = await trpc.apiKey.getScope.query();

    if (result.scoped) {
      return {
        scoped: true,
        chatId: result.chatId,
        chatTitle: result.chatTitle,
      };
    } else {
      return {
        scoped: false,
        chatId: null,
        chatTitle: null,
      };
    }
  } catch {
    console.error(
      "Warning: Could not determine API key scope. Assuming unscoped (superadmin)."
    );
    return { scoped: false, chatId: null, chatTitle: null };
  }
}

/**
 * Resolves the chat_id for a tool call.
 * If scoped, returns the scoped chatId (ignoring any user-provided value).
 * If unscoped, returns the user-provided chatId or throws.
 */
export async function resolveChatId(
  trpc: TrpcClient,
  userProvidedChatId?: number
): Promise<number> {
  const scope = await getScope(trpc);

  if (scope.scoped && scope.chatId !== null) {
    return scope.chatId;
  }

  if (userProvidedChatId === undefined) {
    throw new Error(
      "chat_id is required. This API key is not scoped to a specific chat."
    );
  }

  return userProvidedChatId;
}
