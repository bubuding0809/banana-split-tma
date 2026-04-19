import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../../trpc.js";
import { withRateLimit } from "../../services/withRateLimit.js";
import { retractDelivery } from "../../services/broadcastActions.js";

export default adminProcedure
  .input(
    z.object({
      broadcastId: z.string(),
      deliveryIds: z.array(z.string()).optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
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

    const serial = withRateLimit(100);
    const runOne = serial((id: string) => retractDelivery(ctx, id));
    const results = await Promise.all(deliveries.map((d) => runOne(d.id)));

    return { results };
  });
