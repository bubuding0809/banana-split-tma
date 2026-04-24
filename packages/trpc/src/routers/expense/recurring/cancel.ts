import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { DeleteScheduleCommand } from "@aws-sdk/client-scheduler";
import { protectedProcedure } from "../../../trpc.js";
import { assertChatAccess } from "../../../middleware/chatScope.js";
import { getSchedulerClient } from "../../aws/utils/schedulerClient.js";
import { RECURRING_EXPENSE_SCHEDULE_GROUP } from "../../aws/utils/recurringExpenseScheduler.js";

export const inputSchema = z.object({
  templateId: z.string().uuid(),
});

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    // Gate access before the full read to avoid leaking template existence.
    const tmplMeta = await ctx.db.recurringExpenseTemplate.findUnique({
      where: { id: input.templateId },
      select: { chatId: true },
    });
    if (!tmplMeta) throw new TRPCError({ code: "NOT_FOUND" });
    await assertChatAccess(ctx.session, ctx.db, tmplMeta.chatId);

    const tmpl = await ctx.db.recurringExpenseTemplate.findUnique({
      where: { id: input.templateId },
    });
    // Defense-in-depth — should never be null after the meta fetch succeeded.
    if (!tmpl) throw new TRPCError({ code: "NOT_FOUND" });

    // 1. DB soft-cancel first — even if AWS delete fails afterwards, the
    //    tick endpoint will reject because status != ACTIVE.
    await ctx.db.recurringExpenseTemplate.update({
      where: { id: tmpl.id },
      data: { status: "CANCELED" },
    });

    // 2. AWS delete. Any error is logged but does not roll back the DB
    //    cancel — the schedule may keep firing for ≤24h until cleaned up
    //    manually, but firing into a CANCELED template is a no-op.
    try {
      await getSchedulerClient().send(
        new DeleteScheduleCommand({
          Name: tmpl.awsScheduleName,
          GroupName: RECURRING_EXPENSE_SCHEDULE_GROUP,
        })
      );
    } catch (awsError) {
      if (
        awsError instanceof Error &&
        awsError.name === "ResourceNotFoundException"
      ) {
        // Already gone; fine.
      } else {
        console.error(
          "AWS schedule delete failed (DB cancel succeeded)",
          awsError
        );
      }
    }

    return { ok: true };
  });
