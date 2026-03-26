import { Db } from "../trpc.js";
import { TRPCError } from "@trpc/server";

interface SessionWithScope {
  authType: "superadmin" | "chat-api-key" | "user-api-key" | "telegram";
  chatId: bigint | null;
  user?: { id: bigint | number; [key: string]: any } | null;
  parsedInitData?: any | null;
}

/**
 * Asserts that a session is authorized to access the given chatId.
 * - Superadmin: always allowed (no restriction).
 * - Chat-api-key auth: input chatId must match session chatId exactly.
 * - User-api-key / Telegram auth: MUST verify membership via db.
 *
 * Call this at the START of any procedure handler that accepts chatId as input.
 */
export async function assertChatAccess(
  session: SessionWithScope,
  db: Db,
  inputChatId: bigint | number
): Promise<void> {
  if (session.authType === "superadmin") return;

  const inputAsBigInt =
    typeof inputChatId === "number" ? BigInt(inputChatId) : inputChatId;

  if (session.authType === "chat-api-key") {
    if (session.chatId !== inputAsBigInt) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This API key does not have access to the requested chat",
      });
    }
    return;
  }

  // telegram or user-api-key auth MUST verify membership
  if (!("user" in session) || !session.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User not authenticated",
    });
  }

  const isMember = await db.chat.findFirst({
    where: {
      id: inputAsBigInt,
      members: { some: { id: BigInt((session.user as any).id) } },
    },
  });

  if (!isMember) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this chat",
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
