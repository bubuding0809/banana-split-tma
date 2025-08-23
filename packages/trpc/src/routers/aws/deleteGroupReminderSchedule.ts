import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { awsCredentialsProvider } from "@vercel/functions/oidc";
import { protectedProcedure } from "../../trpc.js";
import {
  generateGroupReminderScheduleName,
  validateChatId,
  getGroupReminderSchedule,
  deleteGroupReminderSchedule as deleteScheduleUtil,
} from "./utils/groupReminderUtils.js";

const AWS_REGION = process.env.AWS_REGION!;
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN!;
const IS_VERCEL_RUNTIME = process.env.VERCEL === "1";

// Initialize the EventBridge Scheduler Client
const schedulerClient = new SchedulerClient({
  ...(IS_VERCEL_RUNTIME && {
    credentials: awsCredentialsProvider({
      roleArn: AWS_ROLE_ARN,
    }),
    region: AWS_REGION,
  }),
});

export const inputSchema = z.object({
  chatId: z
    .string()
    .min(1, "Chat ID is required")
    .refine(
      validateChatId,
      "Invalid Telegram chat ID format. Must be a numeric string (can be negative for groups)"
    )
    .describe("Telegram chat ID to identify the schedule to delete"),
});

export const outputSchema = z.object({
  chatId: z.string().describe("Telegram chat ID of the deleted schedule"),
  scheduleName: z.string().describe("Name of the deleted schedule"),
  deleted: z.boolean().describe("Confirmation that the schedule was deleted"),
  deletedDate: z.date().describe("Date when the schedule was deleted"),
  scheduleDetails: z
    .object({
      dayOfWeek: z
        .string()
        .optional()
        .describe("Day of week that was scheduled"),
      time: z.string().optional().describe("Time that was scheduled"),
      timezone: z.string().describe("Timezone that was used"),
      description: z
        .string()
        .optional()
        .describe("Description of the deleted schedule"),
      wasEnabled: z
        .boolean()
        .describe("Whether the schedule was enabled before deletion"),
    })
    .optional()
    .describe("Details of the deleted schedule"),
  message: z.string().describe("Success message"),
});

export const deleteGroupReminderScheduleHandler = async (
  input: z.infer<typeof inputSchema>
) => {
  try {
    const { chatId } = input;

    // Get existing schedule details before deletion (for response information)
    const existingSchedule = await getGroupReminderSchedule(
      schedulerClient,
      chatId
    );

    if (!existingSchedule) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Group reminder schedule not found for chat ID: ${chatId}`,
      });
    }

    const scheduleName = generateGroupReminderScheduleName(chatId);

    // Delete the schedule
    const deleted = await deleteScheduleUtil(schedulerClient, chatId);

    if (!deleted) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete group reminder schedule for chat ID: ${chatId}`,
      });
    }

    // Return confirmation with details
    return {
      chatId,
      scheduleName,
      deleted: true,
      deletedDate: new Date(),
      scheduleDetails: {
        dayOfWeek: existingSchedule.dayOfWeek,
        time: existingSchedule.time,
        timezone: existingSchedule.timezone || "UTC",
        description: existingSchedule.description,
        wasEnabled: existingSchedule.enabled,
      },
      message: `Successfully deleted weekly group reminder for chat ${chatId}`,
    };
  } catch (error) {
    // Re-throw TRPCErrors as-is
    if (error instanceof TRPCError) {
      throw error;
    }

    // Handle AWS SDK and other errors
    if (error instanceof Error) {
      if (error.name === "ResourceNotFoundException") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Group reminder schedule not found for chat ID: ${input.chatId}`,
        });
      }

      if (error.name === "ValidationException") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `AWS validation error: ${error.message}`,
        });
      }
    }

    console.error("Failed to delete group reminder schedule:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to delete group reminder schedule: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "DELETE",
      path: "/aws/group-reminder/delete",
      tags: ["aws", "reminders"],
      summary: "Delete weekly group reminder schedule",
      description:
        "Deletes an existing weekly recurring schedule for sending reminders to a Telegram group. This action is irreversible.",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input }) => {
    return deleteGroupReminderScheduleHandler(input);
  });
