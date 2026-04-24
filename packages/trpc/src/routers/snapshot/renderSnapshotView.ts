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
  // Optional tapper id for callers (like the bot) that authenticate
  // via superadmin API key and therefore don't have a populated
  // `ctx.session.user`. When present, we authorize against this id —
  // the bot forwards `ctx.callbackQuery.from.id` so we still verify
  // that whoever tapped is a chat member.
  userId: z.number().int().optional(),
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
    const effectiveUserId = input.userId ?? ctx.session.user?.id;
    if (effectiveUserId === undefined || effectiveUserId === null) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }
    const snapshotCtx = await loadSnapshotContext(
      ctx.db,
      ctx.teleBot,
      input.snapshotId,
      BigInt(effectiveUserId)
    );
    return buildSnapshotMessage(snapshotCtx, input.view);
  });
