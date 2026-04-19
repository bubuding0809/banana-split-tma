import { z } from "zod";
import { adminProcedure } from "../../trpc.js";
import { broadcast } from "../../services/broadcast.js";

export default adminProcedure
  .input(
    z.object({
      message: z.string(),
      targetUserIds: z.array(z.number()).max(200).optional(),
    })
  )
  .mutation(({ input, ctx }) =>
    broadcast(ctx, {
      message: input.message,
      targetUserIds: input.targetUserIds,
    })
  );
