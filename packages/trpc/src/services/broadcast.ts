import telegramifyMarkdown from "telegramify-markdown";
import type { Telegram } from "telegraf";
import type { Db } from "../trpc.js";

const RATE_LIMIT_DELAY_MS = 100;

export type BroadcastMedia = {
  kind: "photo" | "video";
  buffer: Buffer;
  filename: string;
};

export type BroadcastFailure = { userId: number; error: string };

export type BroadcastResult = {
  successCount: number;
  failCount: number;
  failures: BroadcastFailure[];
};

type BroadcastOptions = {
  message: string;
  targetUserIds?: number[];
  media?: BroadcastMedia;
};

type BroadcastContext = {
  db: Db;
  teleBot: Telegram;
};

async function resolveTargets(
  db: Db,
  targetUserIds?: number[]
): Promise<{ id: bigint }[]> {
  if (targetUserIds === undefined) {
    return db.user.findMany({ select: { id: true } });
  }
  if (targetUserIds.length === 0) return [];
  return db.user.findMany({
    where: { id: { in: targetUserIds.map((id) => BigInt(id)) } },
    select: { id: true },
  });
}

export async function broadcast(
  ctx: BroadcastContext,
  { message, targetUserIds, media }: BroadcastOptions
): Promise<BroadcastResult> {
  const users = await resolveTargets(ctx.db, targetUserIds);
  const caption = message.trim()
    ? telegramifyMarkdown(message, "escape")
    : undefined;

  let cachedFileId: string | undefined;
  let successCount = 0;
  let failCount = 0;
  const failures: BroadcastFailure[] = [];

  for (const user of users) {
    const userId = Number(user.id);
    try {
      if (media) {
        const source = cachedFileId ?? {
          source: media.buffer,
          filename: media.filename,
        };
        const extra = caption
          ? { caption, parse_mode: "MarkdownV2" as const }
          : undefined;

        if (media.kind === "photo") {
          const sent = await ctx.teleBot.sendPhoto(userId, source, extra);
          if (!cachedFileId) {
            const largest = sent.photo[sent.photo.length - 1];
            cachedFileId = largest?.file_id;
          }
        } else {
          const sent = await ctx.teleBot.sendVideo(userId, source, extra);
          if (!cachedFileId) {
            cachedFileId = sent.video.file_id;
          }
        }
      } else if (caption) {
        await ctx.teleBot.sendMessage(userId, caption, {
          parse_mode: "MarkdownV2",
        });
      } else {
        throw new Error("Broadcast must have a message or media attached.");
      }
      successCount++;
    } catch (error) {
      console.error(`Broadcast to ${userId} failed:`, error);
      failCount++;
      failures.push({
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
  }

  return { successCount, failCount, failures };
}
