import { trpc } from "./client.js";

interface Scope {
  scoped: boolean;
  chatId: number | null;
  chatTitle: string | null;
}

let cachedScope: Scope | null = null;

/**
 * Fetches and caches the API key scope.
 * Chat-scoped keys return { scoped: true, chatId, chatTitle }.
 * Superadmin keys return { scoped: false, chatId: null, chatTitle: null }.
 */
export async function getScope(): Promise<Scope> {
  if (cachedScope) return cachedScope;

  try {
    const result = await trpc.apiKey.getScope.query();

    if (result.scoped) {
      cachedScope = {
        scoped: true,
        chatId: result.chatId,
        chatTitle: result.chatTitle,
      };
    } else {
      cachedScope = {
        scoped: false,
        chatId: null,
        chatTitle: null,
      };
    }
  } catch {
    // If getScope fails (e.g., old API without the endpoint), assume unscoped
    console.error(
      "Warning: Could not determine API key scope. Assuming unscoped (superadmin)."
    );
    cachedScope = { scoped: false, chatId: null, chatTitle: null };
  }

  return cachedScope;
}

/**
 * Resolves the chat_id for a tool call.
 * If scoped, returns the scoped chatId (ignoring any user-provided value).
 * If unscoped, returns the user-provided chatId or throws.
 */
export async function resolveChatId(
  userProvidedChatId?: number
): Promise<number> {
  const scope = await getScope();

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
