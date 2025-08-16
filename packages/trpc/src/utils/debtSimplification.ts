import { Decimal } from "decimal.js";
import { toDecimal, toNumber, FINANCIAL_THRESHOLDS } from "./financial.js";

/**
 * Represents a simplified debt transaction between two users
 */
export interface SimplifiedDebt {
  /** User ID who should pay */
  fromUserId: number;
  /** User ID who should receive payment */
  toUserId: number;
  /** Amount to be paid */
  amount: number;
}

/**
 * Represents a user's net balance in the debt graph
 */
interface UserBalance {
  userId: number;
  balance: Decimal;
}

/**
 * Simplifies debts using a greedy algorithm to minimize the number of transactions.
 * This algorithm works by repeatedly matching the largest creditor with the largest debtor.
 *
 * @param balances - Map of userId to their net balance (positive = owed money, negative = owes money)
 * @returns Array of simplified debt transactions
 */
export function simplifyDebts(balances: Map<number, number>): SimplifiedDebt[] {
  const simplifiedDebts: SimplifiedDebt[] = [];

  // Convert to decimal and filter out insignificant balances
  const userBalances: UserBalance[] = Array.from(balances.entries())
    .map(([userId, balance]) => ({
      userId,
      balance: toDecimal(balance),
    }))
    .filter(({ balance }) =>
      balance.abs().greaterThan(FINANCIAL_THRESHOLDS.DISPLAY)
    );

  // Create working copies for the algorithm
  const workingBalances = userBalances.map(({ userId, balance }) => ({
    userId,
    balance: new Decimal(balance),
  }));

  while (true) {
    // Find the user who is owed the most (largest positive balance)
    const maxCreditor = workingBalances
      .filter(({ balance }) => balance.greaterThan(0))
      .reduce(
        (max, current) =>
          current.balance.greaterThan(max.balance) ? current : max,
        { userId: -1, balance: new Decimal(-1) }
      );

    // Find the user who owes the most (largest negative balance in absolute terms)
    const maxDebtor = workingBalances
      .filter(({ balance }) => balance.lessThan(0))
      .reduce(
        (max, current) =>
          current.balance.lessThan(max.balance) ? current : max,
        { userId: -1, balance: new Decimal(1) }
      );

    // If we can't find both a creditor and debtor, we're done
    if (maxCreditor.userId === -1 || maxDebtor.userId === -1) {
      break;
    }

    // Calculate the settlement amount (minimum of what creditor is owed and what debtor owes)
    const settlementAmount = Decimal.min(
      maxCreditor.balance,
      maxDebtor.balance.abs()
    );

    // Only create a transaction if the amount is significant
    if (settlementAmount.greaterThan(FINANCIAL_THRESHOLDS.DISPLAY)) {
      simplifiedDebts.push({
        fromUserId: maxDebtor.userId,
        toUserId: maxCreditor.userId,
        amount: toNumber(settlementAmount),
      });
    }

    // Update the balances
    maxCreditor.balance = maxCreditor.balance.minus(settlementAmount);
    maxDebtor.balance = maxDebtor.balance.plus(settlementAmount);

    // Remove users with zero balances to avoid unnecessary iterations
    const creditorIndex = workingBalances.findIndex(
      (b) => b.userId === maxCreditor.userId
    );
    const debtorIndex = workingBalances.findIndex(
      (b) => b.userId === maxDebtor.userId
    );

    if (
      maxCreditor.balance.abs().lessThanOrEqualTo(FINANCIAL_THRESHOLDS.DISPLAY)
    ) {
      workingBalances.splice(creditorIndex, 1);
    }

    if (
      maxDebtor.balance.abs().lessThanOrEqualTo(FINANCIAL_THRESHOLDS.DISPLAY)
    ) {
      // Adjust index if creditor was removed before debtor
      const adjustedDebtorIndex =
        creditorIndex < debtorIndex ? debtorIndex - 1 : debtorIndex;
      workingBalances.splice(adjustedDebtorIndex, 1);
    }
  }

  return simplifiedDebts;
}

/**
 * Calculates the reduction in number of transactions achieved by debt simplification
 *
 * @param originalDebts - Number of original debt relationships
 * @param simplifiedDebts - Number of simplified transactions
 * @returns Object with original count, simplified count, and reduction percentage
 */
export function calculateTransactionReduction(
  originalDebts: number,
  simplifiedDebts: number
): {
  original: number;
  simplified: number;
  reduction: number;
  reductionPercentage: number;
} {
  const reduction = Math.max(0, originalDebts - simplifiedDebts);
  const reductionPercentage =
    originalDebts > 0 ? (reduction / originalDebts) * 100 : 0;

  return {
    original: originalDebts,
    simplified: simplifiedDebts,
    reduction,
    reductionPercentage: Math.round(reductionPercentage),
  };
}

/**
 * Validates that the simplified debts preserve the original balances
 * This is a safety check to ensure the algorithm doesn't introduce errors
 *
 * @param originalBalances - Original balance map
 * @param simplifiedDebts - Simplified debt transactions
 * @returns True if balances are preserved, false otherwise
 */
export function validateDebtSimplification(
  originalBalances: Map<number, number>,
  simplifiedDebts: SimplifiedDebt[]
): boolean {
  const reconstructedBalances = new Map<number, Decimal>();

  // Initialize with original balances
  for (const [userId, balance] of originalBalances) {
    reconstructedBalances.set(userId, toDecimal(balance));
  }

  // Apply simplified transactions
  for (const debt of simplifiedDebts) {
    const fromBalance =
      reconstructedBalances.get(debt.fromUserId) || new Decimal(0);
    const toBalance =
      reconstructedBalances.get(debt.toUserId) || new Decimal(0);

    reconstructedBalances.set(debt.fromUserId, fromBalance.minus(debt.amount));
    reconstructedBalances.set(debt.toUserId, toBalance.plus(debt.amount));
  }

  // Check if all balances are within acceptable tolerance
  for (const [userId, originalBalance] of originalBalances) {
    const reconstructedBalance =
      reconstructedBalances.get(userId) || new Decimal(0);
    const difference = toDecimal(originalBalance)
      .minus(reconstructedBalance)
      .abs();

    // Allow for small rounding differences
    if (difference.greaterThan(FINANCIAL_THRESHOLDS.AUDIT)) {
      return false;
    }
  }

  return true;
}
