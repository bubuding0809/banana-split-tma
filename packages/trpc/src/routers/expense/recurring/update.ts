import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { UpdateScheduleCommand } from "@aws-sdk/client-scheduler";
import { protectedProcedure } from "../../../trpc.js";
import { assertChatAccess } from "../../../middleware/chatScope.js";
import { getSchedulerClient } from "../../aws/utils/schedulerClient.js";
import { RECURRING_EXPENSE_SCHEDULE_GROUP } from "../../aws/utils/recurringExpenseScheduler.js";
import { buildExpenseCron } from "../../aws/utils/buildExpenseCron.js";
import { computeAwsScheduleStartDate } from "../../aws/utils/computeAwsScheduleStartDate.js";

const FREQUENCY = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const WEEKDAY = z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]);

export const inputSchema = z.object({
  templateId: z.string().uuid(),
  // Schedule fields
  frequency: FREQUENCY.optional(),
  interval: z.number().int().positive().optional(),
  weekdays: z.array(WEEKDAY).optional(),
  endDate: z.date().nullable().optional(),
  // Locked-occurrence fields (v1: only the trivially-changeable ones)
  description: z.string().min(1).max(60).optional(),
  amount: z.number().positive().optional(),
});

const FIRE_HOUR = 9;
const FIRE_MIN = 0;

export default protectedProcedure
  .input(inputSchema)
  .output(z.any())
  .mutation(async ({ input, ctx }) => {
    // Gate access before the full read to avoid leaking template existence.
    const tmplMeta = await ctx.db.recurringExpenseTemplate.findUnique({
      where: { id: input.templateId },
      select: { chatId: true },
    });
    if (!tmplMeta) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
    }
    await assertChatAccess(ctx.session, ctx.db, tmplMeta.chatId);

    const tmpl = await ctx.db.recurringExpenseTemplate.findUnique({
      where: { id: input.templateId },
    });
    // Defense-in-depth — should never be null after the meta fetch succeeded.
    if (!tmpl) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
    }

    const lambdaArn = process.env.AWS_RECURRING_EXPENSE_LAMBDA_ARN;
    const eventBridgeRoleArn = process.env.AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN;
    if (!lambdaArn || !eventBridgeRoleArn) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "AWS_RECURRING_EXPENSE_LAMBDA_ARN or AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN not configured",
      });
    }

    // Snapshot original values for rollback. We avoid spreading the whole
    // template (status enum, BigInts, decimals etc.) into update — only
    // the fields we may change need snapshotting.
    const original = {
      frequency: tmpl.frequency,
      interval: tmpl.interval,
      weekdays: tmpl.weekdays,
      endDate: tmpl.endDate,
      description: tmpl.description,
      amount: tmpl.amount,
    };

    // 1. DB update.
    const updated = await ctx.db.recurringExpenseTemplate.update({
      where: { id: tmpl.id },
      data: {
        frequency: input.frequency ?? tmpl.frequency,
        interval: input.interval ?? tmpl.interval,
        weekdays: input.weekdays ?? tmpl.weekdays,
        endDate: input.endDate === undefined ? tmpl.endDate : input.endDate,
        description: input.description ?? tmpl.description,
        ...(input.amount !== undefined
          ? { amount: input.amount.toString() }
          : {}),
      },
    });

    // 2. AWS update — only if a schedule field changed.
    const scheduleChanged =
      input.frequency !== undefined ||
      input.interval !== undefined ||
      input.weekdays !== undefined ||
      input.endDate !== undefined;

    if (scheduleChanged) {
      try {
        // Extract day-of-month / month in the template's timezone — using
        // getUTCDate()/getUTCMonth() is wrong for non-UTC timezones because
        // a Date that's e.g. midnight SGT is 16:00 UTC the previous day.
        const tzFormat = new Intl.DateTimeFormat("en-US", {
          day: "numeric",
          month: "numeric",
          timeZone: updated.timezone,
        });
        const parts = tzFormat.formatToParts(updated.startDate);
        const dayOfMonth = Number(parts.find((p) => p.type === "day")?.value);
        const month = Number(parts.find((p) => p.type === "month")?.value);

        const cronExpression = buildExpenseCron({
          frequency: updated.frequency,
          interval: updated.interval,
          weekdays: updated.weekdays,
          hour: FIRE_HOUR,
          minute: FIRE_MIN,
          dayOfMonth:
            updated.frequency === "MONTHLY" || updated.frequency === "YEARLY"
              ? dayOfMonth
              : undefined,
          month: updated.frequency === "YEARLY" ? month : undefined,
        });

        const lambdaPayload = JSON.stringify({
          templateId: updated.id,
          occurrenceDate: "<aws.scheduler.scheduled-time>",
        });

        await getSchedulerClient().send(
          new UpdateScheduleCommand({
            Name: updated.awsScheduleName,
            GroupName: RECURRING_EXPENSE_SCHEDULE_GROUP,
            ScheduleExpression: cronExpression,
            ScheduleExpressionTimezone: updated.timezone,
            State: "ENABLED",
            Target: {
              Arn: lambdaArn,
              RoleArn: eventBridgeRoleArn,
              Input: lambdaPayload,
              RetryPolicy: {
                MaximumRetryAttempts: 3,
                MaximumEventAgeInSeconds: 60 * 60 * 24,
              },
            },
            FlexibleTimeWindow: { Mode: "OFF" },
            // updated.startDate is the original transaction date and may
            // be older than 5 minutes, which AWS rejects. Recompute a
            // future-safe StartDate that also lands past the original
            // day boundary in the template's timezone.
            StartDate: computeAwsScheduleStartDate({
              transactionDate: updated.startDate,
              now: new Date(),
              timezone: updated.timezone,
            }),
            EndDate: updated.endDate ?? undefined,
            Description: `Recurring expense ${updated.id} for chat ${updated.chatId}`,
          })
        );
      } catch (awsError) {
        // Roll back DB.
        await ctx.db.recurringExpenseTemplate.update({
          where: { id: updated.id },
          data: original,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update schedule: ${awsError instanceof Error ? awsError.message : "unknown"}`,
        });
      }
    }

    return updated;
  });
