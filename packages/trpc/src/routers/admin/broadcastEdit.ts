import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../../trpc.js";
import { withRateLimit } from "../../services/withRateLimit.js";
import { editDelivery } from "../../services/broadcastActions.js";

export default adminProcedure
  .input(
    z.object({
      broadcastId: z.string(),
      deliveryIds: z.array(z.string()).optional(),
      text: z.string().min(1).max(4096),
      mediaBase64: z.string().optional(),
      mediaKind: z.enum(["photo", "video"]).optional(),
      mediaFilename: z.string().optional(),
      removeMedia: z.boolean().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const broadcast = await ctx.db.broadcast.findUnique({
      where: { id: input.broadcastId },
      select: { mediaKind: true },
    });
    if (!broadcast) throw new TRPCError({ code: "NOT_FOUND" });

    const deliveries = await ctx.db.broadcastDelivery.findMany({
      where: input.deliveryIds
        ? { broadcastId: input.broadcastId, id: { in: input.deliveryIds } }
        : { broadcastId: input.broadcastId },
      select: { id: true },
    });

    if (input.deliveryIds && deliveries.length !== input.deliveryIds.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Some deliveryIds do not belong to this broadcast.",
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

    const serial = withRateLimit(100);
    const runOne = serial((id: string) =>
      editDelivery(ctx, id, broadcast.mediaKind, {
        text: input.text,
        media,
        removeMedia: input.removeMedia,
      })
    );
    const results = await Promise.all(deliveries.map((d) => runOne(d.id)));
    return { results };
  });
