import { Db } from "../trpc.js";
import { TRPCError } from "@trpc/server";

interface SessionWithScope {
  authType: "superadmin" | "chat-api-key" | "user-api-key" | "telegram";
  chatId: bigint | null;
  user?: { id: bigint | number; [key: string]: any } | null;
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
  inputChatId: bigint | number,
  teleBot?: any
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
    // If not in DB but we have telebot, fallback to Telegram API verification
    if (teleBot) {
      try {
        const telegramUser = session.user as any;
        const memberInfo = await teleBot.getChatMember(
          Number(inputAsBigInt),
          Number(telegramUser.id)
        );

        if (
          ["creator", "administrator", "member", "restricted"].includes(
            memberInfo.status
          )
        ) {
          // 1. Ensure user exists in database
          await db.user.upsert({
            where: { id: BigInt(telegramUser.id) },
            update: {
              firstName:
                telegramUser.first_name || telegramUser.firstName || "",
              lastName: telegramUser.last_name || telegramUser.lastName || null,
              username: telegramUser.username || null,
            },
            create: {
              id: BigInt(telegramUser.id),
              firstName:
                telegramUser.first_name || telegramUser.firstName || "",
              lastName: telegramUser.last_name || telegramUser.lastName || null,
              username: telegramUser.username || null,
              phoneNumber: null,
            },
          });

          // 2. Connect user to the chat
          await db.chat.update({
            where: { id: inputAsBigInt },
            data: {
              members: { connect: { id: BigInt(telegramUser.id) } },
            },
          });

          return; // Successfully lazy-loaded membership!
        }
      } catch (err) {
        // Failed to verify via Telegram API, fall through to FORBIDDEN
        console.error(
          `Failed to lazy verify membership for ${session.user.id} in chat ${inputAsBigInt}:`,
          err
        );
      }
    }

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
