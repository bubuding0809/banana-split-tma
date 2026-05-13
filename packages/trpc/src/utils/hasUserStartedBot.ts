import type { Db } from "../trpc.js";

/**
 * In Telegram, a user can only receive bot DMs after sending /start.
 * The bot's start handler upserts a Chat row with id = userId and type='private'.
 * We treat the existence of that row as proof the user can receive DMs.
 */
export async function hasUserStartedBot(
  userId: number,
  db: Db
): Promise<boolean> {
  const row = await db.chat.findUnique({
    where: { id: BigInt(userId) },
    select: { id: true, type: true },
  });
  return !!row && row.type === "private";
}
