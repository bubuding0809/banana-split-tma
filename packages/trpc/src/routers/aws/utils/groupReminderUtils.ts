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
  dayOfWeek?: string;
  time?: string;
  timezone?: string;
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

    // Parse schedule expression to extract day/time info (best effort)
    let dayOfWeek: string | undefined;
    let time: string | undefined;

    // Try to parse human-readable info from description or use defaults
    const description = response.Description || "";
    const scheduleExpression = response.ScheduleExpression || "";

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
