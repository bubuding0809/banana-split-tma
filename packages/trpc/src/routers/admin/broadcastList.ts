import { z } from "zod";
import { adminProcedure } from "../../trpc.js";

export default adminProcedure
  .input(
    z.object({
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
    })
  )
  .query(async ({ input, ctx }) => {
    const rows = await ctx.db.broadcast.findMany({
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        createdByTelegramId: true,
        text: true,
        mediaKind: true,
        status: true,
        parentBroadcastId: true,
        _count: { select: { deliveries: true } },
        deliveries: {
          select: { status: true },
        },
      },
    });

    const hasMore = rows.length > input.limit;
    const items = (hasMore ? rows.slice(0, input.limit) : rows).map((b) => {
      const counts = {
        SENT: 0,
        FAILED: 0,
        RETRACTED: 0,
        EDITED: 0,
        PENDING: 0,
      };
      for (const d of b.deliveries) counts[d.status] += 1;
      return {
        id: b.id,
        createdAt: b.createdAt,
        createdByTelegramId: b.createdByTelegramId?.toString() ?? null,
        text: b.text,
        mediaKind: b.mediaKind,
        status: b.status,
        parentBroadcastId: b.parentBroadcastId,
        totalRecipients: b._count.deliveries,
        successCount: counts.SENT + counts.EDITED,
        failCount: counts.FAILED,
        retractedCount: counts.RETRACTED,
        editedCount: counts.EDITED,
        pendingCount: counts.PENDING,
      };
    });

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    };
  });
