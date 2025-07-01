import { Decimal } from "decimal.js";

/**
 * Financial calculation utilities for precise monetary operations.
 *
 * This module provides production-grade financial calculation helpers
 * that avoid floating point precision issues common in JavaScript.
 */

// Financial thresholds (in dollars)
export const FINANCIAL_THRESHOLDS = {
  /** Minimum amount to display to users (1 cent) */
  DISPLAY: 0.01,
  /** Minimum amount for settlement eligibility ($1.00) */
  SETTLEMENT: 1.0,
  /** Audit trail threshold for tracking all amounts */
  AUDIT: 0.001,
} as const;

/**
 * Branded type for financial amounts to ensure type safety
 */
export type FinancialAmount = number & { readonly __brand: "FinancialAmount" };

/**
 * Converts a database Decimal value to a Decimal.js instance
 * @param value - Database decimal value (can be null/undefined)
 * @returns Decimal instance, defaults to 0 if value is null/undefined
 */
export function toDecimal(value: unknown): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0);
  }
  return new Decimal(value.toString());
}

/**
 * Safely converts a Decimal to a number for final display/API responses
 * @param decimal - Decimal instance
 * @returns Number value
 */
export function toNumber(decimal: Decimal): number {
  return decimal.toNumber();
}

/**
 * Checks if a balance is significant enough to display to users
 * @param balance - Balance amount
 * @param threshold - Minimum threshold (defaults to DISPLAY threshold)
 * @returns True if balance exceeds the threshold
 */
export function isSignificantBalance(
  balance: number | Decimal,
  threshold: number = FINANCIAL_THRESHOLDS.DISPLAY
): boolean {
  const balanceDecimal =
    balance instanceof Decimal ? balance : new Decimal(balance);
  const thresholdDecimal = new Decimal(threshold);
  return balanceDecimal.abs().greaterThan(thresholdDecimal);
}

/**
 * Checks if a positive balance qualifies as a debt (debtor scenario)
 * @param balance - Balance amount
 * @returns True if balance is significantly positive
 */
export function isDebtor(balance: number | Decimal): boolean {
  const balanceDecimal =
    balance instanceof Decimal ? balance : new Decimal(balance);
  return balanceDecimal.greaterThan(FINANCIAL_THRESHOLDS.DISPLAY);
}

/**
 * Checks if a negative balance qualifies as a credit (creditor scenario)
 * @param balance - Balance amount
 * @returns True if balance is significantly negative
 */
export function isCreditor(balance: number | Decimal): boolean {
  const balanceDecimal =
    balance instanceof Decimal ? balance : new Decimal(balance);
  return balanceDecimal.lessThan(-FINANCIAL_THRESHOLDS.DISPLAY);
}

/**
 * Checks if a balance is eligible for settlement
 * @param balance - Balance amount
 * @returns True if balance exceeds settlement threshold
 */
export function isSettlementEligible(balance: number | Decimal): boolean {
  const balanceDecimal =
    balance instanceof Decimal ? balance : new Decimal(balance);
  return balanceDecimal.abs().greaterThan(FINANCIAL_THRESHOLDS.SETTLEMENT);
}

/**
 * Rounds a financial amount to the nearest cent
 * @param amount - Amount to round
 * @returns Decimal rounded to 2 decimal places
 */
export function roundToCents(amount: number | Decimal): Decimal {
  const amountDecimal =
    amount instanceof Decimal ? amount : new Decimal(amount);
  return amountDecimal.toDecimalPlaces(2);
}

/**
 * Formats a financial amount for display
 * @param amount - Amount to format
 * @param currency - Currency symbol (defaults to '$')
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number | Decimal,
  currency: string = "$"
): string {
  const amountDecimal =
    amount instanceof Decimal ? amount : new Decimal(amount);
  const rounded = roundToCents(amountDecimal);
  return `${currency}${rounded.toFixed(2)}`;
}

/**
 * Calculates the sum of an array of decimal amounts
 * @param amounts - Array of amounts to sum
 * @returns Sum as Decimal
 */
export function sumAmounts(
  amounts: (number | Decimal | null | undefined)[]
): Decimal {
  return amounts.reduce<Decimal>((sum, amount) => {
    if (amount === null || amount === undefined) return sum;
    const decimal = amount instanceof Decimal ? amount : new Decimal(amount);
    return sum.plus(decimal);
  }, new Decimal(0));
}
