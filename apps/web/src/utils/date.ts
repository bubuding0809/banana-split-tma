import { format, getMonth, getYear, compareDesc, compareAsc } from "date-fns";

/**
 * Normalize a date to midnight (00:00:00) in the local timezone
 * Used for displaying expense dates consistently
 */
export const normalizeDateToMidnight = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

/**
 * Format a date for display in expense details
 */
export const formatExpenseDate = (date: Date): string => {
  return format(date, "d MMM yyyy");
};

/**
 * Format a date for short display (used in expense cells)
 */
export const formatExpenseDateShort = (date: Date): string => {
  return format(date, "do MMM");
};

/**
 * Format createdAt for short display in expense cells when sorting by createdAt
 */
export const formatExpenseDateShortCreatedAt = (
  date: Date | string
): string => {
  return format(new Date(date), "do MMM");
};

/**
 * Get month and year for grouping expenses
 */
export const getMonthYear = (date: Date): { month: number; year: number } => {
  return {
    month: getMonth(date),
    year: getYear(date),
  };
};

/**
 * Format month and year for display in expense group headers
 */
export const formatMonthYear = (date: Date): string => {
  return format(date, "MMMM yyyy");
};

/**
 * Compare dates for sorting (newest first)
 */
export const compareDatesDesc = (a: Date, b: Date): number => {
  return compareDesc(a, b);
};

/**
 * Compare dates for sorting (oldest first)
 */
export const compareDatesAsc = (a: Date, b: Date): number => {
  return compareAsc(a, b);
};

/**
 * Check if two dates are in the same month and year
 */
export const isSameMonthYear = (date1: Date, date2: Date): boolean => {
  const { month: month1, year: year1 } = getMonthYear(date1);
  const { month: month2, year: year2 } = getMonthYear(date2);
  return month1 === month2 && year1 === year2;
};

/**
 * Format a date for jump-to-date display (e.g., "Mon, Jan 15")
 */
export const formatJumpToDate = (date: Date): string => {
  return format(date, "EEE, MMM d");
};

/**
 * Format a date as YYYY-MM-DD for keys
 */
export const formatDateKey = (date: Date): string => {
  return format(date, "yyyy-MM-dd");
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const formatShortDate = (d: Date): string =>
  `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;

/**
 * Formats a snapshot's earliest → latest expense date range.
 * Mirrors the server-side formatDateRange in shareSnapshotMessage.ts
 * so the in-app header reads identically to the Telegram share header.
 */
export const formatSnapshotDateRange = (
  earliest: Date,
  latest: Date
): string => {
  const sameYear = earliest.getFullYear() === latest.getFullYear();
  const sameMonth = sameYear && earliest.getMonth() === latest.getMonth();
  if (sameMonth) {
    return `${earliest.getDate()}–${latest.getDate()} ${MONTH_SHORT[latest.getMonth()]} ${latest.getFullYear()}`;
  }
  if (sameYear) {
    return `${formatShortDate(earliest)} – ${formatShortDate(latest)} ${latest.getFullYear()}`;
  }
  return `${formatShortDate(earliest)} ${earliest.getFullYear()} – ${formatShortDate(latest)} ${latest.getFullYear()}`;
};
