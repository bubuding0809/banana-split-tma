import { z } from "zod";
import { adminProcedure } from "../../trpc.js";
import { createBroadcast } from "../../services/broadcast.js";

export default adminProcedure
  .input(
    z.object({
      message: z.string().min(1).max(4096),
      targetUserIds: z.array(z.number()).max(500).optional(),
    })
  )
  .mutation(({ input, ctx }) =>
    createBroadcast(ctx, {
      message: input.message,
      targetUserIds: input.targetUserIds,
      createdByTelegramId: null,
    })
  );
