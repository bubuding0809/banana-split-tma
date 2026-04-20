import { z } from "zod";
import { adminProcedure } from "../../trpc.js";
import { resumeSend } from "../../services/broadcastActions.js";

export default adminProcedure
  .input(z.object({ broadcastId: z.string() }))
  .mutation(({ input, ctx }) => resumeSend(ctx, input.broadcastId));
