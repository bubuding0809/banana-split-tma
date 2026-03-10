import type { TrpcClient } from "./client.js";

interface Scope {
  scoped: boolean;
  chatId: number | null;
  chatTitle: string | null;
}

/**
 * Per-request scope cache. Uses WeakMap keyed on TrpcClient so that scope
 * is fetched at most once per request (each request creates a fresh client).
 */
const scopeCache = new WeakMap<TrpcClient, Promise<Scope>>();

/**
 * Fetches the API key scope from the backend.
 * Chat-scoped keys return { scoped: true, chatId, chatTitle }.
 * Superadmin keys return { scoped: false, chatId: null, chatTitle: null }.
 *
 * Results are cached per TrpcClient instance (i.e. per request).
 */
export function getScope(trpc: TrpcClient): Promise<Scope> {
  let cached = scopeCache.get(trpc);
  if (!cached) {
    cached = fetchScope(trpc);
    scopeCache.set(trpc, cached);
  }
  return cached;
}

async function fetchScope(trpc: TrpcClient): Promise<Scope> {
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
  } catch (error) {
    throw new Error(
      `Failed to verify API key scope: ${error instanceof Error ? error.message : String(error)}`
    );
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
