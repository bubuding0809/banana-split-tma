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
    //
    // Mirrors the GroupReminderLambda pattern: EventBridge Scheduler invokes
    // an external RecurringExpenseLambda (in the bananasplit-tgbot AWS repo)
    // which forwards an HMAC-signed POST to our Vercel webhook.
    try {
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
        startDate,
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
