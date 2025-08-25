/**
 * Shared utilities for Group Reminder Schedule management
 */

import {
  SchedulerClient,
  GetScheduleCommand,
  DeleteScheduleCommand,
} from "@aws-sdk/client-scheduler";
import { TRPCError } from "@trpc/server";

export interface GroupReminderScheduleDetails {
  scheduleName: string;
  chatId: string;
  dayOfWeek: string;
  time: string;
  timezone: string;
  description?: string;
  enabled: boolean;
  scheduleExpression: string;
  scheduleArn?: string;
  createdDate?: Date;
  lastModifiedDate?: Date;
}

/**
 * Generates a standardized schedule name for group reminders
 * Format: group-reminder-{normalizedChatId}
 */
export function generateGroupReminderScheduleName(chatId: string): string {
  // Normalize chatId by removing negative sign and any non-numeric chars for name
  const normalizedChatId = chatId.replace(/[^0-9]/g, "");
  return `group-reminder-${normalizedChatId}`;
}

/**
 * Validates Telegram Chat ID format
 * Telegram chat IDs can be positive (private/group) or negative (supergroup/channel)
 */
export function validateChatId(chatId: string): boolean {
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
 * Mapping from AWS EventBridge cron day codes to day names
 */
const CRON_TO_DAY: Record<string, string> = {
  SUN: "sunday",
  MON: "monday",
  TUE: "tuesday",
  WED: "wednesday",
  THU: "thursday",
  FRI: "friday",
  SAT: "saturday",
};

/**
 * Converts 24-hour time to 12-hour format with AM/PM
 */
function formatTime24To12(hour: number, minute: number): string {
  let period = "am";
  let displayHour = hour;

  if (hour === 0) {
    displayHour = 12;
  } else if (hour === 12) {
    period = "pm";
  } else if (hour > 12) {
    displayHour = hour - 12;
    period = "pm";
  }

  if (minute === 0) {
    return `${displayHour}${period}`;
  }

  return `${displayHour}:${minute.toString().padStart(2, "0")}${period}`;
}

/**
 * Parses AWS EventBridge cron expression to extract day of week and time
 * Cron format: cron(minute hour day-of-month month day-of-week year)
 * Example: "cron(30 14 ? * WED *)" -> { dayOfWeek: "wednesday", time: "2:30pm" }
 */
function parseCronExpression(cronExpression: string): {
  dayOfWeek?: string;
  time?: string;
} {
  try {
    // Remove "cron(" prefix and ")" suffix, then split by whitespace
    const cronMatch = cronExpression.match(/^cron\((.+)\)$/);
    if (!cronMatch || !cronMatch[1]) return {};

    const parts = cronMatch[1].split(/\s+/);
    if (parts.length !== 6) return {};

    const [minute, hour, , , dayOfWeek] = parts;

    // Check that we have the required parts
    if (!minute || !hour || !dayOfWeek) return {};

    // Parse time from minute and hour
    const minuteNum = parseInt(minute, 10);
    const hourNum = parseInt(hour, 10);

    if (
      isNaN(minuteNum) ||
      isNaN(hourNum) ||
      hourNum < 0 ||
      hourNum > 23 ||
      minuteNum < 0 ||
      minuteNum > 59
    ) {
      return {};
    }

    const time = formatTime24To12(hourNum, minuteNum);

    // Parse day of week
    const dayName = CRON_TO_DAY[dayOfWeek.toUpperCase()];

    return {
      dayOfWeek: dayName,
      time,
    };
  } catch (error) {
    console.warn("Failed to parse cron expression:", cronExpression, error);
    return {};
  }
}

/**
 * Parses human-readable schedule expression to extract day of week and time
 * Example: "weekly on monday at 9:00am" -> { dayOfWeek: "monday", time: "9:00am" }
 */
function parseHumanReadableExpression(expression: string): {
  dayOfWeek?: string;
  time?: string;
} {
  try {
    const expr = expression.toLowerCase().trim();

    // Match "weekly on [day] at [time]" pattern
    const weeklyMatch = expr.match(
      /^weekly(?:\s+on\s+(\w+))?(?:\s+at\s+(.+))?$/
    );
    if (weeklyMatch) {
      return {
        dayOfWeek: weeklyMatch[1] || undefined,
        time: weeklyMatch[2] || undefined,
      };
    }

    return {};
  } catch (error) {
    console.warn(
      "Failed to parse human-readable expression:",
      expression,
      error
    );
    return {};
  }
}

/**
 * Extracts schedule details from various expression formats
 * Tries multiple parsing strategies in order of preference
 */
export function extractScheduleDetails(scheduleExpression?: string): {
  dayOfWeek?: string;
  time?: string;
} {
  // Default fallback values
  const defaults = { dayOfWeek: undefined, time: undefined };

  // Try to parse from the main schedule expression first (AWS cron format)
  if (scheduleExpression) {
    if (scheduleExpression.startsWith("cron(")) {
      const cronResult = parseCronExpression(scheduleExpression);
      if (cronResult.dayOfWeek && cronResult.time) {
        return cronResult;
      }
    }
  }

  return defaults;
}

/**
 * Retrieves existing group reminder schedule details from AWS EventBridge Scheduler
 */
export async function getGroupReminderSchedule(
  schedulerClient: SchedulerClient,
  chatId: string,
  scheduleGroup: string = "default"
): Promise<GroupReminderScheduleDetails | null> {
  try {
    const scheduleName = generateGroupReminderScheduleName(chatId);

    const getCommand = new GetScheduleCommand({
      Name: scheduleName,
      GroupName: scheduleGroup,
    });

    const response = await schedulerClient.send(getCommand);

    if (!response) {
      return null;
    }

    // Extract schedule details from available information
    const description = response.Description || "";
    const scheduleExpression = response.ScheduleExpression || "";

    // Parse schedule expression to extract day/time info
    const { dayOfWeek, time } = extractScheduleDetails(scheduleExpression);
    if (!dayOfWeek || !time) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to parse schedule expression for chat ID: ${chatId}`,
      });
    }
    dayOfWeek;

    return {
      scheduleName,
      chatId,
      dayOfWeek,
      time,
      timezone: response.ScheduleExpressionTimezone || "UTC",
      description,
      enabled: response.State === "ENABLED",
      scheduleExpression,
      scheduleArn: response.Arn,
      createdDate: response.CreationDate,
      lastModifiedDate: response.LastModificationDate,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      return null; // Schedule doesn't exist
    }
    throw error; // Re-throw other errors
  }
}

/**
 * Deletes a group reminder schedule from AWS EventBridge Scheduler
 */
export async function deleteGroupReminderSchedule(
  schedulerClient: SchedulerClient,
  chatId: string,
  scheduleGroup: string = "default"
): Promise<boolean> {
  try {
    const scheduleName = generateGroupReminderScheduleName(chatId);

    const deleteCommand = new DeleteScheduleCommand({
      Name: scheduleName,
      GroupName: scheduleGroup,
    });

    await schedulerClient.send(deleteCommand);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Group reminder schedule not found for chat ID: ${chatId}`,
      });
    }
    throw error; // Re-throw other errors
  }
}

/**
 * Converts day of week + time to human-readable schedule expression
 */
export function buildScheduleExpression(
  dayOfWeek: string,
  time: string
): string {
  return `weekly on ${dayOfWeek} at ${time}`;
}

/**
 * Validates that at least one update field is provided
 */
export function validateUpdateFields(fields: {
  dayOfWeek?: string;
  time?: string;
  timezone?: string;
  description?: string;
  enabled?: boolean;
}): boolean {
  return Object.values(fields).some((value) => value !== undefined);
}

/**
 * Merges existing schedule details with update fields
 */
export function mergeScheduleUpdate(
  existing: GroupReminderScheduleDetails,
  updates: {
    dayOfWeek?: string;
    time?: string;
    timezone?: string;
    description?: string;
    enabled?: boolean;
  }
): {
  dayOfWeek: string;
  time: string;
  timezone: string;
  description: string;
  enabled: boolean;
} {
  return {
    dayOfWeek: updates.dayOfWeek || existing.dayOfWeek || "monday",
    time: updates.time || existing.time || "9am",
    timezone: updates.timezone || existing.timezone || "UTC",
    description:
      updates.description ||
      existing.description ||
      `Weekly group reminder for chat ${existing.chatId}`,
    enabled: updates.enabled !== undefined ? updates.enabled : existing.enabled,
  };
}
