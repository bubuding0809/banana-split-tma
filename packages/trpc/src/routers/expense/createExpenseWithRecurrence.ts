import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";
import { protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import {
  inputSchema as createExpenseInputSchema,
  createExpenseHandler,
} from "./createExpense.js";
import { getSchedulerClient } from "../aws/utils/schedulerClient.js";
import {
  buildRecurringExpenseScheduleName,
  buildRecurringExpenseHttpTarget,
  RECURRING_EXPENSE_SCHEDULE_GROUP,
} from "../aws/utils/recurringExpenseScheduler.js";
import { buildExpenseCron } from "../aws/utils/buildExpenseCron.js";

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

    const webhookUrl = process.env.RECURRING_EXPENSE_WEBHOOK_URL;
    const webhookSecret = process.env.RECURRING_EXPENSE_WEBHOOK_SECRET;
    if (!webhookUrl || !webhookSecret) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "RECURRING_EXPENSE_WEBHOOK_URL/_SECRET not configured",
      });
    }

    const startDate = input.expense.date ?? new Date();
    const dayOfMonth = startDate.getUTCDate();
    const month = startDate.getUTCMonth() + 1;

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

    // 1. DB transaction: create immediate Expense + RecurringExpenseTemplate.
    const { template, expense } = await ctx.db.$transaction(async (tx) => {
      const tmpl = await tx.recurringExpenseTemplate.create({
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

      const scheduleName = buildRecurringExpenseScheduleName(tmpl.id);
      const updated = await tx.recurringExpenseTemplate.update({
        where: { id: tmpl.id },
        data: { awsScheduleName: scheduleName },
      });

      // Materialise today's expense linked to the template.
      const exp = await createExpenseHandler(
        { ...input.expense, sendNotification: input.expense.sendNotification },
        tx as unknown as typeof ctx.db,
        ctx.teleBot
      );
      await tx.expense.update({
        where: { id: exp.id },
        data: { recurringTemplateId: updated.id },
      });

      return { template: updated, expense: exp };
    });

    // 2. Create the AWS schedule. On failure, roll back the template (keep the expense).
    try {
      const scheduler = getSchedulerClient();
      // NOTE: `buildRecurringExpenseHttpTarget` returns a Universal HTTP
      // invoke target. The SDK type `Target` (models_0.d.ts in
      // @aws-sdk/client-scheduler@3.1021.0) does NOT declare an
      // `HttpParameters` field — the helper extends `Target` with a custom
      // intersection so headers/query/path params survive at runtime. The
      // webhook URL itself is supposed to live in `Target.Arn` (per AWS
      // docs for universal HTTP invoke), but the helper currently sets
      // `Arn: "arn:aws:scheduler:::http-invoke"` and ignores `webhookUrl`.
      // This is a pre-existing bug from Task 3/4 that needs fixing in the
      // helper before this mutation will actually fire requests at the
      // webhook. Tracking via DONE_WITH_CONCERNS.
      const httpTarget = buildRecurringExpenseHttpTarget({
        templateId: template.id,
        webhookUrl,
        secret: webhookSecret,
      });

      await scheduler.send(
        new CreateScheduleCommand({
          Name: template.awsScheduleName,
          GroupName: RECURRING_EXPENSE_SCHEDULE_GROUP,
          ScheduleExpression: cronExpression,
          ScheduleExpressionTimezone: input.recurrence.timezone,
          State: "ENABLED",
          Target: httpTarget,
          FlexibleTimeWindow: { Mode: "OFF" },
          StartDate: startDate,
          EndDate: input.recurrence.endDate ?? undefined,
          Description: `Recurring expense ${template.id} for chat ${template.chatId}`,
        })
      );
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
