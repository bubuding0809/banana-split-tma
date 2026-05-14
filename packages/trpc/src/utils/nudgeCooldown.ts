import type { Db } from "../trpc.js";

export const NUDGE_WINDOW_MS = 86_400_000; // 24h

/**
 * For a single sender → many receivers, returns a map of
 * `receiverUserId → cooldownExpiresAt (ms epoch)` for any pair where
 * a Nudge row exists within the rolling 24h window. Receivers absent
 * from the map are eligible to be nudged.
 *
 * Single batched query — safe for the cross-group counterparties list.
 */
export async function getNudgeCooldowns(
  db: Db,
  senderId: number,
  receiverIds: number[]
): Promise<Map<number, number>> {
  if (receiverIds.length === 0) return new Map();
  const cutoff = new Date(Date.now() - NUDGE_WINDOW_MS);
  const recent = await db.nudge.findMany({
    where: {
      senderId: BigInt(senderId),
      receiverId: { in: receiverIds.map((n) => BigInt(n)) },
      sentAt: { gt: cutoff },
    },
    select: { receiverId: true, sentAt: true },
  });
  const m = new Map<number, number>();
  for (const r of recent) {
    const uid = Number(r.receiverId);
    const expiry = r.sentAt.getTime() + NUDGE_WINDOW_MS;
    const cur = m.get(uid);
    if (cur === undefined || expiry > cur) m.set(uid, expiry);
  }
  return m;
}

/**
 * Inserts a `Nudge` row marking the moment a sender DM'd a receiver.
 * Returns the cooldown expiry timestamp (ms epoch).
 */
export async function recordNudge(
  db: Db,
  senderId: number,
  receiverId: number
): Promise<number> {
  const row = await db.nudge.create({
    data: {
      senderId: BigInt(senderId),
      receiverId: BigInt(receiverId),
    },
    select: { sentAt: true },
  });
  return row.sentAt.getTime() + NUDGE_WINDOW_MS;
}
