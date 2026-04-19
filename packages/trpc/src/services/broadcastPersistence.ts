import type { Prisma } from "@dko/database";
import type { Db } from "../trpc.js";

export type PersistedRecipient = {
  userId: bigint;
  username: string | null;
  firstName: string;
  telegramChatId: bigint;
};

export function dedupeTargetIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export async function resolveRecipients(
  db: Db,
  targetUserIds?: number[]
): Promise<PersistedRecipient[]> {
  const select = { id: true, username: true, firstName: true } as const;
  const rows =
    targetUserIds === undefined
      ? await db.user.findMany({ select })
      : targetUserIds.length === 0
        ? []
        : await db.user.findMany({
            where: {
              id: { in: dedupeTargetIds(targetUserIds).map((n) => BigInt(n)) },
            },
            select,
          });
  return rows.map((u) => ({
    userId: u.id,
    username: u.username,
    firstName: u.firstName,
    telegramChatId: u.id, // DMs: chatId == userId
  }));
}

export async function createBroadcastRows(
  db: Db,
  args: {
    createdByTelegramId: bigint | null;
    text: string;
    mediaKind: "PHOTO" | "VIDEO" | null;
    mediaFileId: string | null;
    mediaFileName: string | null;
    parentBroadcastId: string | null;
    recipients: PersistedRecipient[];
  }
): Promise<{ broadcastId: string; deliveryIdByUserId: Map<bigint, string> }> {
  return db.$transaction(async (tx) => {
    const broadcast = await tx.broadcast.create({
      data: {
        createdByTelegramId: args.createdByTelegramId,
        text: args.text,
        mediaKind: args.mediaKind ?? undefined,
        mediaFileId: args.mediaFileId,
        mediaFileName: args.mediaFileName,
        parentBroadcastId: args.parentBroadcastId,
      },
      select: { id: true },
    });

    const createMany: Prisma.BroadcastDeliveryCreateManyInput[] =
      args.recipients.map((r) => ({
        broadcastId: broadcast.id,
        userId: r.userId,
        username: r.username,
        firstName: r.firstName,
        telegramChatId: r.telegramChatId,
      }));

    await tx.broadcastDelivery.createMany({ data: createMany });

    const rows = await tx.broadcastDelivery.findMany({
      where: { broadcastId: broadcast.id },
      select: { id: true, userId: true },
    });
    const deliveryIdByUserId = new Map<bigint, string>();
    for (const r of rows) deliveryIdByUserId.set(r.userId, r.id);

    return { broadcastId: broadcast.id, deliveryIdByUserId };
  });
}

export async function markDeliverySent(
  db: Db,
  deliveryId: string,
  telegramMessageId: bigint
): Promise<void> {
  await db.broadcastDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "SENT",
      telegramMessageId,
      sentAt: new Date(),
      error: null,
    },
  });
}

export async function markDeliveryFailed(
  db: Db,
  deliveryId: string,
  error: string
): Promise<void> {
  await db.broadcastDelivery.update({
    where: { id: deliveryId },
    data: { status: "FAILED", error },
  });
}

export async function finalizeBroadcast(
  db: Db,
  broadcastId: string,
  outcome: { successCount: number; failCount: number }
): Promise<void> {
  const status =
    outcome.successCount === 0 && outcome.failCount > 0 ? "FAILED" : "SENT";
  await db.broadcast.update({
    where: { id: broadcastId },
    data: { status },
  });
}
