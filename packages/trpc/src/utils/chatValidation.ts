import { TRPCError } from "@trpc/server";
import { Db } from "../trpc.js";

/**
 * Asserts that all provided user IDs are current members of the specified chat.
 * Throws TRPCError(BAD_REQUEST) if any user is missing.
 */
export async function assertUsersInChat(
  db: Db,
  chatId: bigint | number,
  userIds: (bigint | number)[]
): Promise<void> {
  if (!userIds || userIds.length === 0) return;

  const uniqueIds = Array.from(new Set(userIds.map((id) => BigInt(id))));
  const chatBigInt = typeof chatId === "number" ? BigInt(chatId) : chatId;

  const chat = await db.chat.findUnique({
    where: { id: chatBigInt },
    select: { members: { select: { id: true } } },
  });

  if (!chat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
  }

  const memberIds = new Set(chat.members.map((m) => m.id.toString()));
  const missingUsers = uniqueIds.filter((id) => !memberIds.has(id.toString()));

  if (missingUsers.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unauthorized: The following users are not members of the chat: ${missingUsers.join(", ")}`,
    });
  }
}
