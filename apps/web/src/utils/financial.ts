import Decimal from "decimal.js";

/**
 * Frontend financial utilities for formatting and displaying monetary values
 *
 * Note: These utilities are for display purposes only. All calculations
 * should be done on the backend using Decimal arithmetic.
 */

/**
 * Checks if an amount is significant enough for display (above 1 cent)
 * @param amount - Amount to check
 * @returns True if amount should be displayed to user
 */
export function isSignificantAmount(
  amount: number | null | undefined
): boolean {
  if (amount === null || amount === undefined) return false;
  return Math.abs(amount) >= 0.01;
}

/**
 * Determines the balance type for UI styling
 * @param balance - Balance amount
 * @returns 'positive' for amounts to receive, 'negative' for amounts to pay, 'zero' for neutral
 */
export function getBalanceType(
  balance: number | null | undefined
): "positive" | "negative" | "zero" {
  if (!isSignificantAmount(balance)) return "zero";
  if (balance! > 0) return "positive";
  return "negative";
}

/**
 * Gets the appropriate label for a balance
 * @param balance - Balance amount
 * @returns User-friendly label
 */
export function getBalanceLabel(balance: number | null | undefined): string {
  const type = getBalanceType(balance);
  switch (type) {
    case "positive":
      return "owes you";
    case "negative":
      return "is owed";
    case "zero":
      return "Settled";
    default:
      return "Unknown";
  }
}

/**
 * Gets CSS classes for balance styling
 * @param balance - Balance amount
 * @returns CSS class string for styling
 */
export function getBalanceColorClass(
  balance: number | null | undefined
): string {
  const type = getBalanceType(balance);
  switch (type) {
    case "positive":
      return "text-green-500"; // Money to receive (positive)
    case "negative":
      return "text-red-500"; // Money to pay (negative)
    case "zero":
      return "text-gray-500"; // Settled/neutral
    default:
      return "text-gray-500";
  }
}

/**
 * Frontend Decimal utilities for precise calculations in UI components
 *
 * These are primarily used for form validation and display calculations
 * where precision is needed before sending to the backend.
 */

/**
 * Converts a value to a Decimal instance for precise calculations
 * @param value - Value to convert (string or number)
 * @returns Decimal instance, defaults to 0 if value is empty
 */
export const toDecimal = (value: string | number): Decimal =>
  new Decimal(value || 0);

/**
 * Converts a Decimal back to a number for display or API calls
 * @param decimal - Decimal instance
 * @returns Number value
 */
export const toNumber = (decimal: Decimal): number => decimal.toNumber();

/**
 * Sums an array of values using Decimal arithmetic for precision
 * @param values - Array of string or number values to sum
 * @returns Sum as Decimal instance
 */
export const sumDecimals = (values: (string | number)[]): Decimal => {
  return values.reduce((sum, val) => sum.plus(toDecimal(val)), new Decimal(0));
};

/**
 * An `Intl.NumberFormat` instance configured for formatting numbers as Singapore Dollars (SGD).
 *
 * Formats numbers using the "en-SG" locale with exactly two decimal places.
 * Example output: "$1,234.56"
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat}
 */
export const sgdFormatter = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a financial amount with proper currency formatting using Intl.NumberFormat
 * @param amount - Amount to format (from API response)
 * @param currencyCode - 3-letter currency code (e.g., "USD", "SGD")
 * @returns Formatted currency string (e.g., "$123.45", "€123.45")
 */
export function formatCurrencyWithCode(
  amount: number | null | undefined,
  currencyCode: string = "SGD"
): string {
  if (amount === null || amount === undefined) {
    amount = 0;
  }

  try {
    // Use Intl.NumberFormat for proper currency formatting
    const formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return formatter.format(Math.abs(amount));
  } catch {
    // Fallback if currency code is invalid
    return `${currencyCode.toUpperCase()} ${Math.abs(amount).toFixed(2)}`;
  }
}
