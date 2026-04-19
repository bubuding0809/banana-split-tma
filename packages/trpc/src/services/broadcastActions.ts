import type { Telegram } from "telegraf";
import type { Db } from "../trpc.js";

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
