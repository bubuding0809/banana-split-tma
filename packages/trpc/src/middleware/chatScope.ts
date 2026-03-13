import { TRPCError } from "@trpc/server";

interface SessionWithScope {
  authType: "superadmin" | "chat-api-key" | "user-api-key" | "telegram";
  chatId: bigint | null;
}

/**
 * Asserts that a chat-scoped API key is authorized to access the given chatId.
 * - Superadmin and telegram auth: always allowed (no restriction).
 * - Chat-api-key auth: input chatId must match session chatId exactly.
 *
 * Call this at the START of any procedure handler that accepts chatId as input.
 */
export function assertChatScope(
  session: SessionWithScope,
  inputChatId: bigint | number
): void {
  if (session.authType !== "chat-api-key") {
    return; // Superadmin and telegram are unrestricted
  }

  const inputAsBigInt =
    typeof inputChatId === "number" ? BigInt(inputChatId) : inputChatId;

  if (session.chatId !== inputAsBigInt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This API key does not have access to the requested chat",
    });
  }
}

/**
 * Asserts that the current request is NOT from a chat-scoped API key.
 * Use this for procedures that should be blocked entirely for chat-scoped keys
 * (e.g., getAllChats, telegram.* procedures).
 */
export function assertNotChatScoped(session: SessionWithScope): void {
  if (session.authType === "chat-api-key") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This operation is not available with a chat-scoped API key",
    });
  }
}
