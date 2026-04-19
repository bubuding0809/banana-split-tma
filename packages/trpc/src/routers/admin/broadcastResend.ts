import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../../trpc.js";
import { createBroadcast } from "../../services/broadcast.js";

export default adminProcedure
  .input(
    z.object({
      broadcastId: z.string(),
      deliveryIds: z.array(z.string()).optional(),
      failuresOnly: z.boolean().optional(),
      text: z.string().max(4096).optional(),
      mediaBase64: z.string().optional(),
      mediaKind: z.enum(["photo", "video"]).optional(),
      mediaFilename: z.string().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const source = await ctx.db.broadcast.findUnique({
      where: { id: input.broadcastId },
      include: {
        deliveries: {
          select: { id: true, userId: true, status: true },
        },
      },
    });
    if (!source) throw new TRPCError({ code: "NOT_FOUND" });

    let selected = source.deliveries;
    if (input.deliveryIds) {
      const allowed = new Set(input.deliveryIds);
      selected = selected.filter((d) => allowed.has(d.id));
      if (selected.length !== input.deliveryIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
    } else if (input.failuresOnly) {
      selected = selected.filter((d) => d.status === "FAILED");
    }

    const targetUserIds = Array.from(
      new Set(selected.map((d) => Number(d.userId)))
    );
    if (targetUserIds.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No recipients to resend to.",
      });
    }

    const media =
      input.mediaBase64 && input.mediaKind && input.mediaFilename
        ? {
            kind: input.mediaKind,
            buffer: Buffer.from(input.mediaBase64, "base64"),
            filename: input.mediaFilename,
          }
        : undefined;

    return createBroadcast(ctx, {
      message: input.text ?? source.text,
      targetUserIds,
      media,
      createdByTelegramId: null,
      parentBroadcastId: source.id,
    });
  });
