import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { assertChatScope } from "../../middleware/chatScope.js";
import { createRecurringScheduleHandler } from "./createRecurringSchedule.js";
import {
  generateGroupReminderScheduleName,
  getGroupReminderSchedule,
  deleteGroupReminderSchedule,
  validateUpdateFields,
  mergeScheduleUpdate,
} from "./utils/groupReminderUtils.js";
import { getSchedulerClient } from "./utils/schedulerClient.js";

const AWS_GROUP_REMINDER_LAMBDA_ARN =
  process.env.AWS_GROUP_REMINDER_LAMBDA_ARN!;

// Valid days of the week
const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

// Common timezone validation
// Must match COMMON_TIMEZONES in apps/web/src/constants/timezones.ts
const COMMON_TIMEZONES = [
  // Universal
  "UTC",

  // North America
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",

  // South America
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "America/Lima",
  "America/Santiago",

  // Europe
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Europe/Athens",
  "Europe/Dublin",

  // Middle East
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Jerusalem",
  "Asia/Tehran",

  // Asia
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Manila",
  "Asia/Kuala_Lumpur",
  "Asia/Hong_Kong",
  "Asia/Seoul",
  "Asia/Taipei",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Kathmandu",
  "Asia/Almaty",

  // Oceania
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "Pacific/Guam",

  // Africa
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Africa/Lagos",
];

export const inputSchema = z
  .object({
    chatId: z.number(),

    dayOfWeek: z
      .enum(DAYS_OF_WEEK)
      .optional()
      .describe("New day of the week for the weekly reminder"),

    time: z
      .string()
      .min(1, "Time cannot be empty")
      .optional()
      .describe("New time in various formats: '9am', '2:30pm', '14:30', etc."),

    timezone: z
      .string()
      .min(1, "Timezone cannot be empty")
      .refine((tz) => {
        if (!tz) return true; // Optional field
        // Check if it's a common timezone or follows IANA format
        if (COMMON_TIMEZONES.includes(tz)) return true;

        // Basic IANA timezone format validation
        const ianaPattern = /^[A-Z][a-z]+\/[A-Z][a-z]+(?:\/[A-Z][a-z]+)?$/;
        return ianaPattern.test(tz);
      }, "Invalid timezone format. Use IANA timezone names like 'Asia/Singapore', 'America/New_York', or 'UTC'")
      .optional()
      .describe("New IANA timezone identifier"),

    description: z
      .string()
      .max(512, "Description must be 512 characters or less")
      .optional()
      .describe("Updated description for the group reminder schedule"),

    enabled: z
      .boolean()
      .optional()
      .describe("Enable or disable the reminder schedule"),
  })
  .refine((data) => validateUpdateFields(data), {
    message:
      "At least one field (dayOfWeek, time, timezone, description, or enabled) must be provided for update",
  });

export const outputSchema = z.object({
  scheduleArn: z.string().describe("ARN of the updated schedule"),
  scheduleName: z.string().describe("Schedule name"),
  scheduleExpression: z.string().describe("Updated schedule expression"),
  chatId: z.number().describe("Telegram chat ID for the group"),
  dayOfWeek: z.string().describe("Current day of the week for reminders"),
  time: z.string().describe("Current time for the reminder"),
  timezone: z.string().describe("Current timezone for the schedule"),
  lambdaTarget: z
    .object({
      arn: z.string().describe("GroupReminderLambda ARN"),
      payload: z.string().describe("Payload sent to Lambda function"),
    })
    .describe("Lambda target configuration"),
  state: z
    .enum(["ENABLED", "DISABLED"])
    .describe("Current state of the schedule"),
  updatedDate: z.date().describe("Date when the schedule was updated"),
  message: z.string().describe("Success message"),
});

export const updateGroupReminderScheduleHandler = async (
  input: z.infer<typeof inputSchema>
) => {
  try {
    const { chatId, dayOfWeek, time, timezone, description, enabled } = input;

    // Get existing schedule
    const schedulerClient = getSchedulerClient();
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

    // Merge existing schedule with updates
    const mergedConfig = mergeScheduleUpdate(existingSchedule, {
      dayOfWeek,
      time,
      timezone,
      description,
      enabled,
    });

    const scheduleName = generateGroupReminderScheduleName(chatId);
    const scheduleExpression = `weekly on ${mergedConfig.dayOfWeek} at ${mergedConfig.time}`;

    // Create standardized payload for GroupReminderLambda
    const lambdaPayload = {
      chatId: chatId.toString(),
    };

    // Delete existing schedule first
    await deleteGroupReminderSchedule(schedulerClient, chatId);

    // Create new schedule with updated configuration
    const result = await createRecurringScheduleHandler({
      scheduleName,
      scheduleExpression,
      lambdaArn: AWS_GROUP_REMINDER_LAMBDA_ARN,
      payload: lambdaPayload,
      description: mergedConfig.description,
      timezone: mergedConfig.timezone,
      enabled: mergedConfig.enabled,
      scheduleGroup: "default",
    });

    // Return domain-specific response
    return {
      scheduleArn: result.scheduleArn,
      scheduleName: result.scheduleName,
      scheduleExpression: result.scheduleExpression,
      chatId,
      dayOfWeek: mergedConfig.dayOfWeek,
      time: mergedConfig.time,
      timezone: mergedConfig.timezone,
      lambdaTarget: {
        arn: AWS_GROUP_REMINDER_LAMBDA_ARN,
        payload: JSON.stringify(lambdaPayload),
      },
      state: result.state,
      updatedDate: new Date(),
      message: `Successfully updated weekly group reminder for chat ${chatId} - now scheduled for ${mergedConfig.dayOfWeek} at ${mergedConfig.time} (${mergedConfig.timezone})`,
    };
  } catch (error) {
    // Re-throw TRPCErrors as-is
    if (error instanceof TRPCError) {
      throw error;
    }

    // Handle validation and other errors
    console.error("Failed to update group reminder schedule:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to update group reminder schedule: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "PUT",
      path: "/aws/group-reminder/update",
      tags: ["aws", "reminders"],
      summary: "Update weekly group reminder schedule",
      description:
        "Updates an existing weekly recurring schedule for sending reminders to a Telegram group. Allows partial updates of day, time, timezone, description, or enabled state.",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    assertChatScope(ctx.session, input.chatId);
    return updateGroupReminderScheduleHandler(input);
  });
