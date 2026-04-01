import { z } from "zod";
import { formOptions } from "@tanstack/react-form";
import {
  COMMON_TIMEZONES,
  DAYS_OF_WEEK,
  type Timezone,
  type DayOfWeek,
} from "@/constants/timezones";

/**
 * Schema for editing reminder schedule
 */
export const editReminderScheduleSchema = z.object({
  timezone: z.enum(COMMON_TIMEZONES, {
    errorMap: () => ({ message: "Please select a valid timezone" }),
  }),
  dayOfWeek: z.enum(DAYS_OF_WEEK, {
    errorMap: () => ({ message: "Please select a day of the week" }),
  }),
  time: z
    .string()
    .min(1, "Time is required")
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
      message: "Time must be in HH:mm format (24-hour)",
    }),
});

export type EditReminderScheduleFormData = z.infer<
  typeof editReminderScheduleSchema
>;

/**
 * Form options for @tanstack/react-form
 */
export const editReminderScheduleFormOpts = formOptions({
  defaultValues: {
    timezone: "Asia/Singapore" as Timezone,
    dayOfWeek: "sunday" as DayOfWeek,
    time: "21:00",
  },
  validators: {
    onChange: editReminderScheduleSchema,
  },
});

/**
 * Converts 12-hour time format (e.g., "9pm", "2:30pm") to 24-hour format (HH:mm)
 */
export function convert12HourTo24Hour(time12h: string): string {
  // Handle formats like "9pm", "9:00pm", "2:30pm"
  const timeMatch = time12h.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);

  if (!timeMatch || !timeMatch[1] || !timeMatch[3]) {
    // If it doesn't match 12-hour format, assume it's already 24-hour
    return time12h;
  }

  let hour = parseInt(timeMatch[1], 10);
  const minute = timeMatch[2] || "00";
  const period = timeMatch[3].toLowerCase();

  // Convert to 24-hour format
  if (period === "pm" && hour !== 12) {
    hour += 12;
  } else if (period === "am" && hour === 12) {
    hour = 0;
  }

  return `${hour.toString().padStart(2, "0")}:${minute}`;
}

/**
 * Converts 24-hour time format (HH:mm) to 12-hour format (e.g., "9:00pm")
 */
export function convert24HourTo12Hour(time24h: string): string {
  const [hourStr, minute] = time24h.split(":");
  if (!hourStr || !minute) return time24h;

  let hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "pm" : "am";

  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour -= 12;
  }

  return minute === "00" ? `${hour}${period}` : `${hour}:${minute}${period}`;
}
