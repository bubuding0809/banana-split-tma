import type { Telegram } from "telegraf";
import type { Db } from "../trpc.js";
import telegramifyMarkdown from "telegramify-markdown";
import { selectEditMethod, type CurrentKind } from "./broadcastEditMethod.js";

export type DeliveryActionResult = {
  deliveryId: string;
  userId: string;
  username: string | null;
  firstName: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export async function retractDelivery(
  ctx: { db: Db; teleBot: Telegram },
  deliveryId: string
): Promise<DeliveryActionResult> {
  const d = await ctx.db.broadcastDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (!d) {
    return {
      deliveryId,
      userId: "0",
      username: null,
      firstName: "",
      ok: false,
      error: "delivery_not_found",
    };
  }
  const base = {
    deliveryId,
    userId: d.userId.toString(),
    username: d.username,
    firstName: d.firstName,
  };
  if (d.status !== "SENT" && d.status !== "EDITED") {
    return { ...base, ok: false, skipped: true, error: "not_deliverable" };
  }
  if (!d.telegramMessageId) {
    return { ...base, ok: false, skipped: true, error: "no_message_id" };
  }
  try {
    await ctx.teleBot.deleteMessage(
      Number(d.telegramChatId),
      Number(d.telegramMessageId)
    );
    await ctx.db.broadcastDelivery.update({
      where: { id: deliveryId },
      data: { status: "RETRACTED", retractedAt: new Date() },
    });
    return { ...base, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await ctx.db.broadcastDelivery.update({
      where: { id: deliveryId },
      data: { error: msg },
    });
    return { ...base, ok: false, error: msg };
  }
}

export type EditInput = {
  text?: string;
  media?: { kind: "photo" | "video"; buffer: Buffer; filename: string };
  removeMedia?: boolean;
};

export async function editDelivery(
  ctx: { db: Db; teleBot: Telegram },
  deliveryId: string,
  broadcastCurrentKind: CurrentKind,
  input: EditInput
): Promise<DeliveryActionResult> {
  const d = await ctx.db.broadcastDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (!d) {
    return {
      deliveryId,
      userId: "0",
      username: null,
      firstName: "",
      ok: false,
      error: "delivery_not_found",
    };
  }
  const base = {
    deliveryId,
    userId: d.userId.toString(),
    username: d.username,
    firstName: d.firstName,
  };
  if (d.status !== "SENT" && d.status !== "EDITED") {
    return { ...base, ok: false, skipped: true, error: "not_editable" };
  }
  if (!d.telegramMessageId) {
    return { ...base, ok: false, skipped: true, error: "no_message_id" };
  }

  const nextText = input.text ?? "";
  const caption = nextText.trim()
    ? telegramifyMarkdown(nextText, "escape")
    : undefined;

  const decision = selectEditMethod({
    currentKind: broadcastCurrentKind,
    nextText,
    nextMedia: Boolean(input.media),
    removeMedia: input.removeMedia,
  });

  if (decision.method === null) {
    return { ...base, ok: false, skipped: true, error: decision.error };
  }

  const chatId = Number(d.telegramChatId);
  const msgId = Number(d.telegramMessageId);

  try {
    let editedMediaFileId: string | null = null;
    if (decision.method === "editMessageText") {
      await ctx.teleBot.editMessageText(
        chatId,
        msgId,
        undefined,
        caption ?? "",
        {
          parse_mode: "MarkdownV2",
        }
      );
    } else if (decision.method === "editMessageCaption") {
      await ctx.teleBot.editMessageCaption(chatId, msgId, undefined, caption, {
        parse_mode: "MarkdownV2",
      });
    } else {
      const m = input.media!;
      const sent = await ctx.teleBot.editMessageMedia(
        chatId,
        msgId,
        undefined,
        {
          type: m.kind,
          media: { source: m.buffer, filename: m.filename },
          caption,
          parse_mode: "MarkdownV2",
        }
      );
      if (typeof sent !== "boolean") {
        if (m.kind === "photo" && "photo" in sent) {
          editedMediaFileId =
            sent.photo[sent.photo.length - 1]?.file_id ?? null;
        } else if (m.kind === "video" && "video" in sent) {
          editedMediaFileId = sent.video.file_id;
        }
      }
    }

    await ctx.db.broadcastDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "EDITED",
        lastEditedAt: new Date(),
        editedText: nextText,
        editedMediaFileId,
      },
    });
    return { ...base, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await ctx.db.broadcastDelivery.update({
      where: { id: deliveryId },
      data: { error: msg },
    });
    return { ...base, ok: false, error: msg };
  }
}
