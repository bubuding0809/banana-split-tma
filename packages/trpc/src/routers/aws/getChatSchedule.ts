import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { getGroupReminderSchedule } from "./utils/groupReminderUtils.js";
import { getSchedulerClient } from "./utils/schedulerClient.js";

export const inputSchema = z.object({
  chatId: z.number().describe("Telegram chat ID"),
});

export const outputSchema = z
  .object({
    scheduleName: z.string().describe("Auto-generated schedule name"),
    chatId: z.number().describe("Telegram chat ID"),
    dayOfWeek: z.string().optional().describe("Day of the week for reminders"),
    time: z.string().optional().describe("Time for the reminder"),
    timezone: z.string().describe("Timezone for the schedule"),
    description: z.string().optional().describe("Schedule description"),
    enabled: z.boolean().describe("Whether the schedule is enabled"),
    scheduleExpression: z.string().describe("AWS schedule expression"),
    scheduleArn: z.string().optional().describe("ARN of the schedule"),
    createdDate: z.date().optional().describe("Date when schedule was created"),
    lastModifiedDate: z
      .date()
      .optional()
      .describe("Date when schedule was last modified"),
  })
  .nullable()
  .describe("Schedule details (null if no schedule exists)");

export const getChatScheduleHandler = async (
  input: z.infer<typeof inputSchema>
) => {
  try {
    const { chatId } = input;

    // Get existing schedule from AWS EventBridge Scheduler
    const schedulerClient = getSchedulerClient();
    const schedule = await getGroupReminderSchedule(schedulerClient, chatId);
    return schedule;
  } catch (error) {
    // Re-throw TRPCErrors as-is
    if (error instanceof TRPCError) {
      throw error;
    }

    // Handle AWS and other errors
    console.error("Failed to get chat schedule:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to get chat schedule: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/aws/group-reminder/schedule/{chatId}",
      tags: ["aws", "reminders"],
      summary: "Get group reminder schedule for chat",
      description:
        "Retrieves the current group reminder schedule configuration for a Telegram chat, including schedule details needed for settings UI",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return getChatScheduleHandler(input);
  });
