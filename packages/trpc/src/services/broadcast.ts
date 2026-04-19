import telegramifyMarkdown from "telegramify-markdown";
import type { Telegram } from "telegraf";
import type { Db } from "../trpc.js";

const RATE_LIMIT_DELAY_MS = 100;

export type BroadcastMedia = {
  kind: "photo" | "video";
  buffer: Buffer;
  filename: string;
};

export type BroadcastRecipient = {
  userId: number;
  username: string | null;
  firstName: string;
};

export type BroadcastSuccess = BroadcastRecipient;

export type BroadcastFailure = BroadcastRecipient & { error: string };

export type BroadcastResult = {
  successCount: number;
  failCount: number;
  successes: BroadcastSuccess[];
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

type TargetUser = { id: bigint; username: string | null; firstName: string };

async function resolveTargets(
  db: Db,
  targetUserIds?: number[]
): Promise<TargetUser[]> {
  const select = { id: true, username: true, firstName: true } as const;
  if (targetUserIds === undefined) {
    return db.user.findMany({ select });
  }
  if (targetUserIds.length === 0) return [];
  return db.user.findMany({
    where: { id: { in: targetUserIds.map((id) => BigInt(id)) } },
    select,
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
  const successes: BroadcastSuccess[] = [];
  const failures: BroadcastFailure[] = [];

  for (const user of users) {
    const userId = Number(user.id);
    const recipient: BroadcastRecipient = {
      userId,
      username: user.username,
      firstName: user.firstName,
    };
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
      successes.push(recipient);
    } catch (error) {
      console.error(`Broadcast to ${userId} failed:`, error);
      failures.push({
        ...recipient,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
  }

  return {
    successCount: successes.length,
    failCount: failures.length,
    successes,
    failures,
  };
}
