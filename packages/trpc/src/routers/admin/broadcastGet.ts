import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../../trpc.js";

export default adminProcedure
  .input(z.object({ broadcastId: z.string() }))
  .query(async ({ input, ctx }) => {
    const b = await ctx.db.broadcast.findUnique({
      where: { id: input.broadcastId },
      include: {
        deliveries: { orderBy: { sentAt: "asc" } },
      },
    });
    if (!b) throw new TRPCError({ code: "NOT_FOUND" });

    return {
      id: b.id,
      createdAt: b.createdAt,
      createdByTelegramId: b.createdByTelegramId?.toString() ?? null,
      text: b.text,
      mediaKind: b.mediaKind,
      mediaFileId: b.mediaFileId,
      mediaFileName: b.mediaFileName,
      status: b.status,
      parentBroadcastId: b.parentBroadcastId,
      deliveries: b.deliveries.map((d) => ({
        id: d.id,
        userId: d.userId.toString(),
        username: d.username,
        firstName: d.firstName,
        telegramChatId: d.telegramChatId.toString(),
        telegramMessageId: d.telegramMessageId?.toString() ?? null,
        status: d.status,
        error: d.error,
        sentAt: d.sentAt,
        lastEditedAt: d.lastEditedAt,
        retractedAt: d.retractedAt,
        editedText: d.editedText,
        editedMediaFileId: d.editedMediaFileId,
      })),
    };
  });
