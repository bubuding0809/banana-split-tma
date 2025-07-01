/**
 * Frontend financial utilities for formatting and displaying monetary values
 *
 * Note: These utilities are for display purposes only. All calculations
 * should be done on the backend using Decimal arithmetic.
 */

/**
 * Formats a financial amount for display with proper currency formatting
 * @param amount - Amount to format (from API response)
 * @param currency - Currency symbol (defaults to '$')
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string = "$"
): string {
  if (amount === null || amount === undefined) {
    return `${currency}0.00`;
  }

  // Ensure we display exactly 2 decimal places
  return `${currency}${Math.abs(amount).toFixed(2)}`;
}

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
      return "To receive";
    case "negative":
      return "To pay";
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
