import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import {
  SNAPSHOT_VIEWS,
  buildSnapshotMessage,
  loadSnapshotContext,
} from "./shareSnapshotMessage.js";

const inputSchema = z.object({
  snapshotId: z.string().uuid(),
  view: z.enum(SNAPSHOT_VIEWS),
});

// Output mirrors the shape of a Telegram InlineKeyboardMarkup so the
// bot callback handler can forward `replyMarkup` straight into
// editMessageText without reconstruction.
const outputSchema = z.object({
  text: z.string(),
  replyMarkup: z.object({
    inline_keyboard: z.array(
      z.array(
        z.union([
          z.object({ text: z.string(), callback_data: z.string() }),
          z.object({ text: z.string(), url: z.string() }),
        ])
      )
    ),
  }),
});

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    if (!ctx.session.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }
    const snapshotCtx = await loadSnapshotContext(
      ctx.db,
      ctx.teleBot,
      input.snapshotId,
      BigInt(ctx.session.user.id)
    );
    return buildSnapshotMessage(snapshotCtx, input.view);
  });
