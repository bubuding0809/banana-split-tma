/**
 * Common timezones supported for reminder scheduling
 * Must match COMMON_TIMEZONES in packages/trpc/src/routers/aws/createGroupReminderSchedule.ts
 * Organized by region for better UX
 */
export const COMMON_TIMEZONES = [
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
] as const;

export type Timezone = (typeof COMMON_TIMEZONES)[number];

/**
 * Day of week options for reminder scheduling
 */
export const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/**
 * Formats day of week for display (capitalize first letter)
 */
export function formatDayOfWeek(day: DayOfWeek): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/**
 * Timezone offset information (GMT offset)
 * Note: These are standard time offsets. DST may affect actual offset.
 */
const TIMEZONE_OFFSETS: Record<Timezone, string> = {
  // Universal
  UTC: "GMT+0",

  // North America
  "America/New_York": "GMT-5",
  "America/Chicago": "GMT-6",
  "America/Denver": "GMT-7",
  "America/Los_Angeles": "GMT-8",
  "America/Phoenix": "GMT-7",
  "America/Toronto": "GMT-5",
  "America/Vancouver": "GMT-8",
  "America/Mexico_City": "GMT-6",

  // South America
  "America/Sao_Paulo": "GMT-3",
  "America/Buenos_Aires": "GMT-3",
  "America/Lima": "GMT-5",
  "America/Santiago": "GMT-4",

  // Europe
  "Europe/London": "GMT+0",
  "Europe/Berlin": "GMT+1",
  "Europe/Paris": "GMT+1",
  "Europe/Rome": "GMT+1",
  "Europe/Moscow": "GMT+3",
  "Europe/Istanbul": "GMT+3",
  "Europe/Athens": "GMT+2",
  "Europe/Dublin": "GMT+0",

  // Middle East
  "Asia/Dubai": "GMT+4",
  "Asia/Riyadh": "GMT+3",
  "Asia/Jerusalem": "GMT+2",
  "Asia/Tehran": "GMT+3:30",

  // Asia
  "Asia/Tokyo": "GMT+9",
  "Asia/Shanghai": "GMT+8",
  "Asia/Singapore": "GMT+8",
  "Asia/Kolkata": "GMT+5:30",
  "Asia/Bangkok": "GMT+7",
  "Asia/Jakarta": "GMT+7",
  "Asia/Manila": "GMT+8",
  "Asia/Kuala_Lumpur": "GMT+8",
  "Asia/Hong_Kong": "GMT+8",
  "Asia/Seoul": "GMT+9",
  "Asia/Taipei": "GMT+8",
  "Asia/Karachi": "GMT+5",
  "Asia/Dhaka": "GMT+6",
  "Asia/Kathmandu": "GMT+5:45",
  "Asia/Almaty": "GMT+6",

  // Oceania
  "Australia/Sydney": "GMT+10",
  "Australia/Melbourne": "GMT+10",
  "Australia/Perth": "GMT+8",
  "Pacific/Auckland": "GMT+12",
  "Pacific/Fiji": "GMT+12",
  "Pacific/Guam": "GMT+10",

  // Africa
  "Africa/Cairo": "GMT+2",
  "Africa/Johannesburg": "GMT+2",
  "Africa/Nairobi": "GMT+3",
  "Africa/Lagos": "GMT+1",
};

/**
 * Formats timezone for display with GMT offset
 * @example "Asia/Singapore" => "Asia/Singapore (GMT+8)"
 */
export function formatTimezone(timezone: Timezone): string {
  const name = timezone.replace(/_/g, " ");
  const offset = TIMEZONE_OFFSETS[timezone];
  return `${name} (${offset})`;
}
