import { format, getMonth, getYear, compareDesc, compareAsc } from "date-fns";

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
  return format(date, "MMM d");
};

/**
 * Get month and year for grouping expenses
 */
export const getExpenseMonthYear = (
  date: Date
): { month: number; year: number } => {
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
  const { month: month1, year: year1 } = getExpenseMonthYear(date1);
  const { month: month2, year: year2 } = getExpenseMonthYear(date2);
  return month1 === month2 && year1 === year2;
};
