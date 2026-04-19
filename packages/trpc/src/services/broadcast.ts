import telegramifyMarkdown from "telegramify-markdown";
import type { Telegram } from "telegraf";
import type { Db } from "../trpc.js";
import { withRateLimit } from "./withRateLimit.js";
import {
  createBroadcastRows,
  finalizeBroadcast,
  markDeliveryFailed,
  markDeliverySent,
  resolveRecipients,
} from "./broadcastPersistence.js";

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
  broadcastId: string;
  successCount: number;
  failCount: number;
  successes: BroadcastSuccess[];
  failures: BroadcastFailure[];
};

export type CreateBroadcastOptions = {
  message: string;
  targetUserIds?: number[];
  media?: BroadcastMedia;
  createdByTelegramId: bigint | null;
  parentBroadcastId?: string;
};

export type BroadcastContext = {
  db: Db;
  teleBot: Telegram;
};

export async function createBroadcast(
  ctx: BroadcastContext,
  opts: CreateBroadcastOptions
): Promise<BroadcastResult> {
  const recipients = await resolveRecipients(ctx.db, opts.targetUserIds);
  const caption = opts.message.trim()
    ? telegramifyMarkdown(opts.message, "escape")
    : undefined;

  const { broadcastId, deliveryIdByUserId } = await createBroadcastRows(
    ctx.db,
    {
      createdByTelegramId: opts.createdByTelegramId,
      text: opts.message,
      mediaKind:
        opts.media?.kind === "photo"
          ? "PHOTO"
          : opts.media?.kind === "video"
            ? "VIDEO"
            : null,
      mediaFileId: null,
      mediaFileName: opts.media?.filename ?? null,
      parentBroadcastId: opts.parentBroadcastId ?? null,
      recipients,
    }
  );

  let cachedFileId: string | undefined;
  const successes: BroadcastSuccess[] = [];
  const failures: BroadcastFailure[] = [];

  const serial = withRateLimit(RATE_LIMIT_DELAY_MS);
  const sendOne = serial(async (r: (typeof recipients)[number]) => {
    const userId = Number(r.userId);
    const recipient: BroadcastRecipient = {
      userId,
      username: r.username,
      firstName: r.firstName,
    };
    const deliveryId = deliveryIdByUserId.get(r.userId);
    if (!deliveryId) return;

    try {
      let sentMessageId: number;

      if (opts.media) {
        const source = cachedFileId ?? {
          source: opts.media.buffer,
          filename: opts.media.filename,
        };
        const extra = caption
          ? { caption, parse_mode: "MarkdownV2" as const }
          : undefined;

        if (opts.media.kind === "photo") {
          const sent = await ctx.teleBot.sendPhoto(userId, source, extra);
          sentMessageId = sent.message_id;
          if (!cachedFileId) {
            const largest = sent.photo[sent.photo.length - 1];
            cachedFileId = largest?.file_id;
            if (cachedFileId) {
              await ctx.db.broadcast.update({
                where: { id: broadcastId },
                data: { mediaFileId: cachedFileId },
              });
            }
          }
        } else {
          const sent = await ctx.teleBot.sendVideo(userId, source, extra);
          sentMessageId = sent.message_id;
          if (!cachedFileId) {
            cachedFileId = sent.video.file_id;
            if (cachedFileId) {
              await ctx.db.broadcast.update({
                where: { id: broadcastId },
                data: { mediaFileId: cachedFileId },
              });
            }
          }
        }
      } else if (caption) {
        const sent = await ctx.teleBot.sendMessage(userId, caption, {
          parse_mode: "MarkdownV2",
        });
        sentMessageId = sent.message_id;
      } else {
        throw new Error("Broadcast must have a message or media attached.");
      }

      await markDeliverySent(ctx.db, deliveryId, BigInt(sentMessageId));
      successes.push(recipient);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`Broadcast to ${userId} failed:`, error);
      await markDeliveryFailed(ctx.db, deliveryId, msg);
      failures.push({ ...recipient, error: msg });
    }
  });

  await Promise.all(recipients.map(sendOne));

  await finalizeBroadcast(ctx.db, broadcastId, {
    successCount: successes.length,
    failCount: failures.length,
  });

  return {
    broadcastId,
    successCount: successes.length,
    failCount: failures.length,
    successes,
    failures,
  };
}
