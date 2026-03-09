import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { assertChatScope } from "../../middleware/chatScope.js";
import { createRecurringScheduleHandler } from "./createRecurringSchedule.js";

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

/**
 * Validates Telegram Chat ID format
 * Telegram chat IDs can be positive (private/group) or negative (supergroup/channel)
 */
function validateChatId(chatId: string): boolean {
  // Must be a numeric string, can be negative
  const numericPattern = /^-?\d+$/;

  if (!numericPattern.test(chatId)) {
    return false;
  }

  const numValue = parseInt(chatId, 10);

  // Telegram chat IDs have reasonable bounds
  // Private chats: positive integers
  // Groups/supergroups: negative integers (usually very large)
  return Math.abs(numValue) > 0 && Math.abs(numValue) <= 9999999999999; // ~10^13 limit
}

/**
 * Generates a standardized schedule name for group reminders
 */
function generateScheduleName(chatId: string): string {
  // Normalize chatId by removing negative sign and any non-numeric chars for name
  const normalizedChatId = chatId.replace(/[^0-9]/g, "");
  return `group-reminder-${normalizedChatId}`;
}

/**
 * Converts day of week + time to human-readable schedule expression
 */
function buildScheduleExpression(dayOfWeek: string, time: string): string {
  return `weekly on ${dayOfWeek} at ${time}`;
}

export const inputSchema = z.object({
  chatId: z
    .string()
    .min(1, "Chat ID is required")
    .refine(
      validateChatId,
      "Invalid Telegram chat ID format. Must be a numeric string (can be negative for groups)"
    ),

  dayOfWeek: z
    .enum(DAYS_OF_WEEK)
    .describe("Day of the week for the weekly reminder"),

  time: z
    .string()
    .min(1, "Time is required")
    .describe("Time in various formats: '9am', '2:30pm', '14:30', etc."),

  timezone: z
    .string()
    .min(1, "Timezone is required")
    .refine((tz) => {
      // Check if it's a common timezone or follows IANA format
      if (COMMON_TIMEZONES.includes(tz)) return true;

      // Basic IANA timezone format validation (Area/City or Area/Subarea/City)
      const ianaPattern = /^[A-Z][a-z]+\/[A-Z][a-z]+(?:\/[A-Z][a-z]+)?$/;
      return ianaPattern.test(tz);
    }, "Invalid timezone format. Use IANA timezone names like 'Asia/Singapore', 'America/New_York', or 'UTC'")
    .describe(
      "IANA timezone identifier (e.g., 'Asia/Singapore', 'America/New_York', 'UTC')"
    ),

  description: z
    .string()
    .max(512, "Description must be 512 characters or less")
    .optional()
    .describe("Optional description for the group reminder schedule"),

  enabled: z
    .boolean()
    .default(true)
    .describe("Whether the reminder should be enabled initially"),
});

export const outputSchema = z.object({
  scheduleArn: z.string().describe("ARN of the created schedule"),
  scheduleName: z.string().describe("Auto-generated schedule name"),
  scheduleExpression: z.string().describe("Generated schedule expression"),
  chatId: z.string().describe("Telegram chat ID for the group"),
  dayOfWeek: z.string().describe("Day of the week for reminders"),
  time: z.string().describe("Time for the reminder"),
  timezone: z.string().describe("Timezone for the schedule"),
  lambdaTarget: z
    .object({
      arn: z.string().describe("GroupReminderLambda ARN"),
      payload: z
        .object({
          chatId: z.string().describe("Chat ID sent to Lambda"),
        })
        .describe("Payload sent to Lambda function"),
    })
    .describe("Lambda target configuration"),
  state: z
    .enum(["ENABLED", "DISABLED"])
    .describe("Current state of the schedule"),
  createdDate: z.date().describe("Date when the schedule was created"),
  message: z.string().describe("Success message"),
});

export const createGroupReminderScheduleHandler = async (
  input: z.infer<typeof inputSchema>
) => {
  try {
    const { chatId, dayOfWeek, time, timezone, description, enabled } = input;

    // Generate schedule name and expression
    const scheduleName = generateScheduleName(chatId);
    const scheduleExpression = buildScheduleExpression(dayOfWeek, time);

    // Create standardized payload for GroupReminderLambda
    const lambdaPayload = {
      chatId: chatId,
    };

    // Generate description if not provided
    const finalDescription =
      description ||
      `Weekly group reminder for chat ${chatId} every ${dayOfWeek} at ${time} (${timezone})`;

    // Call the base createRecurringSchedule handler
    const result = await createRecurringScheduleHandler({
      scheduleName,
      scheduleExpression,
      lambdaArn: AWS_GROUP_REMINDER_LAMBDA_ARN,
      payload: lambdaPayload,
      description: finalDescription,
      timezone,
      enabled,
      scheduleGroup: "default", // Use default group for simplicity
    });

    // Return domain-specific response
    return {
      scheduleArn: result.scheduleArn,
      scheduleName: result.scheduleName,
      scheduleExpression: result.scheduleExpression,
      chatId,
      dayOfWeek,
      time,
      timezone,
      lambdaTarget: {
        arn: AWS_GROUP_REMINDER_LAMBDA_ARN,
        payload: lambdaPayload,
      },
      state: result.state,
      createdDate: result.createdDate,
      message: `Successfully created weekly group reminder for chat ${chatId} every ${dayOfWeek} at ${time} (${timezone})`,
    };
  } catch (error) {
    // Re-throw TRPCErrors as-is
    if (error instanceof TRPCError) {
      throw error;
    }

    // Handle validation and other errors
    console.error("Failed to create group reminder schedule:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to create group reminder schedule: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/aws/group-reminder/create",
      tags: ["aws", "reminders"],
      summary: "Create weekly group reminder schedule",
      description:
        "Creates a weekly recurring schedule to send reminders to a Telegram group using the GroupReminderLambda function",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    assertChatScope(ctx.session, Number(input.chatId));
    return createGroupReminderScheduleHandler(input);
  });
