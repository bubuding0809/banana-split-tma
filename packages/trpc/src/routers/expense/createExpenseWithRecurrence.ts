import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import {
  inputSchema as createExpenseInputSchema,
  createExpenseHandler,
} from "./createExpense.js";
import { createRecurringScheduleHandler } from "../aws/createRecurringSchedule.js";
import {
  buildRecurringExpenseScheduleName,
  RECURRING_EXPENSE_SCHEDULE_GROUP,
} from "../aws/utils/recurringExpenseScheduler.js";
import { buildExpenseCron } from "../aws/utils/buildExpenseCron.js";
import { computeAwsScheduleStartDate } from "../aws/utils/computeAwsScheduleStartDate.js";

const FREQUENCY = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const WEEKDAY = z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]);

const recurrenceSchema = z.object({
  frequency: FREQUENCY,
  interval: z.number().int().positive(),
  weekdays: z.array(WEEKDAY),
  endDate: z.date().optional(),
  timezone: z.string().min(1),
});

export const inputSchema = z.object({
  expense: createExpenseInputSchema,
  recurrence: recurrenceSchema,
});

const FIRE_HOUR = 9;
const FIRE_MIN = 0;

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.expense.chatId);

    if (!process.env.AWS_RECURRING_EXPENSE_LAMBDA_ARN) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AWS_RECURRING_EXPENSE_LAMBDA_ARN not configured",
      });
    }

    const startDate = input.expense.date ?? new Date();
    // Extract day-of-month / month in the chat's timezone — using
    // getUTCDate()/getUTCMonth() is wrong for non-UTC timezones because
    // e.g. a Date that's midnight SGT is 16:00 UTC the previous day,
    // so getUTCDate() would return the wrong day.
    const tzFormat = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "numeric",
      timeZone: input.recurrence.timezone,
    });
    const parts = tzFormat.formatToParts(startDate);
    const dayOfMonth = Number(parts.find((p) => p.type === "day")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);

    const cronExpression = buildExpenseCron({
      frequency: input.recurrence.frequency,
      interval: input.recurrence.interval,
      weekdays: input.recurrence.weekdays,
      hour: FIRE_HOUR,
      minute: FIRE_MIN,
      dayOfMonth:
        input.recurrence.frequency === "MONTHLY" ||
        input.recurrence.frequency === "YEARLY"
          ? dayOfMonth
          : undefined,
      month: input.recurrence.frequency === "YEARLY" ? month : undefined,
    });

    // Sequence:
    //   1. Create the template (no awsScheduleName yet — derived from the row's id).
    //   2. Update the template with its own deterministic awsScheduleName.
    //   3. Materialise today's expense via createExpenseHandler (which opens
    //      its own db.$transaction internally — that's why we DON'T wrap
    //      the whole sequence in an outer $transaction; Prisma forbids
    //      nested transactions on a tx client).
    //   4. Create the AWS schedule.
    //
    // On failure at any step after 1, we delete the template (and any
    // partially-created expense rows linked to it via the cascade FK).
    const tmpl = await ctx.db.recurringExpenseTemplate.create({
      data: {
        chatId: input.expense.chatId,
        creatorId: input.expense.creatorId,
        payerId: input.expense.payerId,
        description: input.expense.description,
        amount: input.expense.amount,
        currency: input.expense.currency ?? "SGD",
        splitMode: input.expense.splitMode,
        participantIds: input.expense.participantIds,
        customSplits: input.expense.customSplits
          ? JSON.parse(JSON.stringify(input.expense.customSplits))
          : null,
        categoryId: input.expense.categoryId ?? null,
        frequency: input.recurrence.frequency,
        interval: input.recurrence.interval,
        weekdays: input.recurrence.weekdays,
        startDate,
        endDate: input.recurrence.endDate ?? null,
        timezone: input.recurrence.timezone,
        awsScheduleName: "", // placeholder — set below
      },
    });

    let template;
    let expense;
    try {
      const scheduleName = buildRecurringExpenseScheduleName(tmpl.id);
      template = await ctx.db.recurringExpenseTemplate.update({
        where: { id: tmpl.id },
        data: { awsScheduleName: scheduleName },
      });

      expense = await createExpenseHandler(
        {
          ...input.expense,
          sendNotification: input.expense.sendNotification,
          recurringTemplateId: template.id,
        },
        ctx.db,
        ctx.teleBot
      );
    } catch (preAwsError) {
      await ctx.db.recurringExpenseTemplate
        .delete({ where: { id: tmpl.id } })
        .catch(() => {});
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to create expense for recurring template: ${preAwsError instanceof Error ? preAwsError.message : "unknown"}`,
      });
    }

    // 2. Create the AWS schedule. On failure, roll back the template (keep the expense).
    //
    // Mirrors the GroupReminderLambda pattern: EventBridge Scheduler invokes
    // an external RecurringExpenseLambda (in the bananasplit-tgbot AWS repo)
    // which forwards an HMAC-signed POST to our Vercel webhook.
    try {
      // AWS Scheduler rejects any StartDate older than 5 minutes. The
      // template.startDate above is the user-supplied transaction date
      // (often "today" — already minutes/hours stale, or backfilled days
      // ago). We need a fresh, future-safe StartDate that also lands AFTER
      // the original transaction's day boundary so the cron's first fire
      // doesn't duplicate the manually-created original expense.
      const awsStartDate = computeAwsScheduleStartDate({
        transactionDate: startDate,
        now: new Date(),
        timezone: input.recurrence.timezone,
      });
      await createRecurringScheduleHandler({
        scheduleName: template.awsScheduleName,
        scheduleExpression: cronExpression,
        lambdaArn: process.env.AWS_RECURRING_EXPENSE_LAMBDA_ARN!,
        payload: {
          templateId: template.id,
          occurrenceDate: "<aws.scheduler.scheduled-time>",
        },
        description: `Recurring expense ${template.id} for chat ${template.chatId}`,
        timezone: input.recurrence.timezone,
        startDate: awsStartDate,
        endDate: input.recurrence.endDate ?? undefined,
        enabled: true,
        scheduleGroup: RECURRING_EXPENSE_SCHEDULE_GROUP,
      });
    } catch (awsError) {
      await ctx.db.recurringExpenseTemplate
        .delete({ where: { id: template.id } })
        .catch(() => {});
      console.error(
        "AWS schedule create failed; rolled back template",
        awsError
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to create recurring schedule: ${awsError instanceof Error ? awsError.message : "unknown"}`,
      });
    }

    return { templateId: template.id, expenseId: expense.id };
  });
