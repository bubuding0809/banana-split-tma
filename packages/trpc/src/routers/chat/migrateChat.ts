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
    // Validate that the old chat exists
    const existingChat = await db.chat.findUnique({
      where: { id: oldChatId },
      include: {
        members: true,
      },
    });

    if (!existingChat) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Chat with ID ${oldChatId} not found`,
      });
    }

    // Validate that the new chat ID doesn't already exist
    const existingNewChat = await db.chat.findUnique({
      where: { id: newChatId },
    });

    if (existingNewChat) {
      // The race condition caused the new chat to be created already.
      // We must explicitly merge the records and delete the old chat.
      const migrationResult = await db.$transaction(async (tx) => {
        const expenseCount = await tx.expense.count({
          where: { chatId: oldChatId },
        });
        const settlementCount = await tx.settlement.count({
          where: { chatId: oldChatId },
        });
        const snapshotCount = await tx.expenseSnapshot.count({
          where: { chatId: oldChatId },
        });

        // Reassign all related records to the newly created chat
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

        // Re-link users
        const oldChat = await tx.chat.findUnique({
          where: { id: oldChatId },
          include: { members: true },
        });
        if (oldChat && oldChat.members.length > 0) {
          const userIds = oldChat.members.map((m) => ({ id: m.id }));
          await tx.chat.update({
            where: { id: newChatId },
            data: { members: { connect: userIds } },
          });
        }

        // Delete the old chat
        await tx.chat.delete({ where: { id: oldChatId } });

        return {
          expenses: expenseCount,
          settlements: settlementCount,
          snapshots: snapshotCount,
          schedules: 0,
        };
      });

      return {
        status: 200,
        message: `Successfully merged existing chat ${oldChatId} into new chat ${newChatId}`,
        migratedRecords: migrationResult,
      };
    }

    // Use a transaction to ensure data integrity
    const migrationResult = await db.$transaction(async (tx) => {
      // Step 1: Get counts of records that will be migrated (for reporting)
      const expenseCount = await tx.expense.count({
        where: { chatId: oldChatId },
      });
      const settlementCount = await tx.settlement.count({
        where: { chatId: oldChatId },
      });
      const snapshotCount = await tx.expenseSnapshot.count({
        where: { chatId: oldChatId },
      });

      // Step 2: Use raw SQL to update the primary key - this will cascade to all related tables
      // Thanks to onUpdate: Cascade in our schema, this single update will automatically
      // update all expenses, settlements, and snapshots while preserving all relationships
      await tx.$executeRaw`UPDATE "Chat" SET id = ${newChatId} WHERE id = ${oldChatId}`;

      return {
        expenses: expenseCount,
        settlements: settlementCount,
        snapshots: snapshotCount,
        schedules: 0,
      };
    });

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

    migrationResult.schedules = schedulesHandled;

    return {
      status: 200,
      message: "Chat migrated successfully",
      migratedRecords: migrationResult,
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
