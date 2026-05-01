import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { getSchedulerClient } from "../aws/utils/schedulerClient.js"; // For type-only import
import {
  getGroupReminderSchedule,
  deleteGroupReminderSchedule,
  generateGroupReminderScheduleName,
} from "../aws/utils/groupReminderUtils.js";
import { createRecurringScheduleHandler } from "../aws/createRecurringSchedule.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";

export const inputSchema = z.object({
  oldChatId: z.number().transform((val) => BigInt(val)),
  newChatId: z.number().transform((val) => BigInt(val)),
});

export const outputSchema = z.object({
  status: z.number(),
  message: z.string(),
  migrated: z.boolean(),
  migratedRecords: z.object({
    expenses: z.number(),
    settlements: z.number(),
    snapshots: z.number(),
    schedules: z.number(),
  }),
});

export const migrateChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const { oldChatId, newChatId } = input;

  try {
    // All reads + writes happen inside a single transaction. We acquire a
    // Postgres transaction-scoped advisory lock on newChatId first so that
    // any concurrent migrate-to-this-target serializes behind us. The lock
    // is auto-released on commit/rollback and is safe across instances.
    const migrationResult = await db.$transaction(async (tx) => {
      // Acquire transaction-scoped advisory lock on newChatId.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${newChatId}::bigint)`;

      // Re-read state inside the lock so we observe the post-serialization view.
      const oldChat = await tx.chat.findUnique({
        where: { id: oldChatId },
        include: { members: true },
      });

      if (!oldChat) {
        return {
          migrated: false as const,
          counts: { expenses: 0, settlements: 0, snapshots: 0, schedules: 0 },
        };
      }

      const newChat = await tx.chat.findUnique({ where: { id: newChatId } });

      if (newChat) {
        // Race-branch: the new chat already exists. Explicitly merge old → new
        // with an "old wins" policy by reparenting old chat's child records.
        const expenseCount = await tx.expense.count({
          where: { chatId: oldChatId },
        });
        const settlementCount = await tx.settlement.count({
          where: { chatId: oldChatId },
        });
        const snapshotCount = await tx.expenseSnapshot.count({
          where: { chatId: oldChatId },
        });

        await tx.expense.updateMany({
          where: { chatId: oldChatId },
          data: { chatId: newChatId },
        });
        await tx.settlement.updateMany({
          where: { chatId: oldChatId },
          data: { chatId: newChatId },
        });
        await tx.expenseSnapshot.updateMany({
          where: { chatId: oldChatId },
          data: { chatId: newChatId },
        });

        // Connect old members to the new chat.
        if (oldChat.members.length > 0) {
          const userIds = oldChat.members.map((m) => ({ id: m.id }));
          await tx.chat.update({
            where: { id: newChatId },
            data: { members: { connect: userIds } },
          });
        }

        // Mark migration source on the new chat row.
        await tx.chat.update({
          where: { id: newChatId },
          data: { migratedFromChatId: oldChatId },
        });

        // Delete old chat (cascades to _ChatToUser).
        await tx.chat.delete({ where: { id: oldChatId } });

        return {
          migrated: true as const,
          counts: {
            expenses: expenseCount,
            settlements: settlementCount,
            snapshots: snapshotCount,
            schedules: 0,
          },
        };
      }

      // Branch B: new chat doesn't exist yet. Use raw SQL to UPDATE the primary
      // key; ON UPDATE CASCADE migrates child FKs in a single statement.
      const expenseCount = await tx.expense.count({
        where: { chatId: oldChatId },
      });
      const settlementCount = await tx.settlement.count({
        where: { chatId: oldChatId },
      });
      const snapshotCount = await tx.expenseSnapshot.count({
        where: { chatId: oldChatId },
      });

      await tx.$executeRaw`UPDATE "Chat" SET id = ${newChatId} WHERE id = ${oldChatId}`;

      // Set migration source on the (now-renamed) chat row.
      await tx.chat.update({
        where: { id: newChatId },
        data: { migratedFromChatId: oldChatId },
      });

      return {
        migrated: true as const,
        counts: {
          expenses: expenseCount,
          settlements: settlementCount,
          snapshots: snapshotCount,
          schedules: 0,
        },
      };
    });

    if (!migrationResult.migrated) {
      return {
        status: 200,
        message: `Chat ${oldChatId} not found — already migrated`,
        migrated: false,
        migratedRecords: migrationResult.counts,
      };
    }

    // Step 6: Handle AWS EventBridge schedules (outside of DB transaction)
    // Note: This is a best-effort operation - we don't fail the migration if schedules fail
    let schedulesHandled = 0;

    try {
      const schedulerClient = getSchedulerClient();

      const existingSchedule = await getGroupReminderSchedule(
        schedulerClient,
        Number(oldChatId)
      );

      if (existingSchedule) {
        // Get the AWS Group Reminder Lambda ARN
        const AWS_GROUP_REMINDER_LAMBDA_ARN =
          process.env.AWS_GROUP_REMINDER_LAMBDA_ARN;

        if (!AWS_GROUP_REMINDER_LAMBDA_ARN) {
          console.error(
            "AWS_GROUP_REMINDER_LAMBDA_ARN not configured - skipping schedule migration"
          );
        } else {
          // Delete the old schedule
          await deleteGroupReminderSchedule(schedulerClient, Number(oldChatId));

          // Create new schedule with the new chat ID, preserving all existing configuration
          const newScheduleName = generateGroupReminderScheduleName(
            Number(newChatId)
          );

          await createRecurringScheduleHandler({
            scheduleName: newScheduleName,
            scheduleExpression: `weekly on ${existingSchedule.dayOfWeek} at ${existingSchedule.time}`,
            lambdaArn: AWS_GROUP_REMINDER_LAMBDA_ARN,
            payload: { chatId: Number(newChatId) },
            description:
              existingSchedule.description ||
              `Weekly group reminder for chat ${newChatId}`,
            timezone: existingSchedule.timezone,
            enabled: existingSchedule.enabled,
            scheduleGroup: "default",
          });

          schedulesHandled = 1;
          console.log(
            `Successfully migrated schedule from chat ${oldChatId} to ${newChatId}`
          );
        }
      } else {
        // No existing schedule found - this is normal, not all chats have schedules
        console.log(
          `No existing schedule found for chat ${oldChatId} - skipping schedule migration`
        );
      }
    } catch (scheduleError) {
      // Log the error but don't fail the migration
      console.error(
        `Failed to migrate schedule during chat migration from ${oldChatId} to ${newChatId}:`,
        scheduleError
      );
    }

    migrationResult.counts.schedules = schedulesHandled;

    return {
      status: 200,
      message: "Chat migrated successfully",
      migrated: true,
      migratedRecords: migrationResult.counts,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    console.error("Error migrating chat:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to migrate chat: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "PATCH",
      path: "/chat/{oldChatId}/migrate",
      contentTypes: ["application/json"],
      tags: ["chat"],
      summary: "Migrate chat to new ID",
      description:
        "Migrates a chat from old ID to new ID, including all related expenses, settlements, snapshots, and AWS schedules",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return migrateChatHandler(input, ctx.db);
  });
