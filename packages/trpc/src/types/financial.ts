/**
 * Financial type definitions for type-safe monetary operations
 */

/**
 * Branded type for financial amounts to ensure type safety
 * This prevents accidental mixing of financial amounts with regular numbers
 */
export type FinancialAmount = number & { readonly __brand: "FinancialAmount" };

/**
 * Branded type for currency codes (ISO 4217)
 */
export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };

/**
 * Represents a monetary value with amount and currency
 */
export interface Money {
  readonly amount: FinancialAmount;
  readonly currency: CurrencyCode;
}

/**
 * Balance calculation result
 */
export interface BalanceResult {
  readonly netAmount: FinancialAmount;
  readonly isDebtor: boolean;
  readonly isCreditor: boolean;
  readonly isSettlementEligible: boolean;
}

/**
 * Settlement record
 */
export interface SettlementRecord {
  readonly id: string;
  readonly senderId: bigint;
  readonly receiverId: bigint;
  readonly amount: FinancialAmount;
  readonly currency: CurrencyCode;
  readonly date: Date;
  readonly description?: string;
}

/**
 * Type guard to check if a value is a FinancialAmount
 */
export function isFinancialAmount(value: unknown): value is FinancialAmount {
  return typeof value === "number" && value >= 0;
}

/**
 * Type guard to check if a value is a CurrencyCode
 */
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

/**
 * Creates a FinancialAmount from a number with validation
 */
export function createFinancialAmount(value: number): FinancialAmount {
  if (typeof value !== "number" || value < 0 || !isFinite(value)) {
    throw new Error(`Invalid financial amount: ${value}`);
  }
  return value as FinancialAmount;
}

/**
 * Creates a CurrencyCode with validation
 */
export function createCurrencyCode(code: string): CurrencyCode {
  if (!isCurrencyCode(code)) {
    throw new Error(`Invalid currency code: ${code}`);
  }
  return code as CurrencyCode;
}

// Common currency codes
export const CURRENCY_CODES = {
  USD: createCurrencyCode("USD"),
  EUR: createCurrencyCode("EUR"),
  GBP: createCurrencyCode("GBP"),
  CAD: createCurrencyCode("CAD"),
  AUD: createCurrencyCode("AUD"),
} as const;
