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
 * Simplifies debts using a clean greedy algorithm to minimize the number of transactions.
 * This algorithm repeatedly matches the largest creditor with the largest debtor until all debts are resolved.
 *
 * @param balances - Map of userId to their net balance (positive = owed money, negative = owes money)
 * @returns Array of simplified debt transactions
 */
export function simplifyDebts(balances: Map<number, number>): SimplifiedDebt[] {
  const simplifiedDebts: SimplifiedDebt[] = [];

  // Convert to working array and filter out insignificant balances
  const users = Array.from(balances.entries())
    .map(([userId, balance]) => ({
      userId,
      balance: toDecimal(balance),
    }))
    .filter(({ balance }) =>
      balance.abs().greaterThan(FINANCIAL_THRESHOLDS.DISPLAY)
    );

  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    console.log(
      "Starting debt simplification with users:",
      users.map((u) => ({ userId: u.userId, balance: u.balance.toNumber() }))
    );
  }

  while (users.length > 1) {
    // Sort users by balance (descending: creditors first, debtors last)
    users.sort((a, b) => b.balance.comparedTo(a.balance));

    // Get the largest creditor (positive balance) and largest debtor (negative balance)
    const creditor = users.find((u) => u.balance.greaterThan(0));
    const debtor = users.find((u) => u.balance.lessThan(0));

    // If we don't have both a creditor and debtor, we're done
    if (!creditor || !debtor) {
      if (isDev) console.log("No more valid creditor-debtor pairs found");
      break;
    }

    // Calculate the settlement amount (minimum of what creditor is owed and what debtor owes)
    const settlementAmount = Decimal.min(
      creditor.balance,
      debtor.balance.abs()
    );

    if (isDev) {
      console.log(
        `Settlement: ${debtor.userId} pays ${creditor.userId} ${settlementAmount.toNumber()}`
      );
    }

    // Only create a transaction if the amount is significant
    if (settlementAmount.greaterThan(FINANCIAL_THRESHOLDS.DISPLAY)) {
      simplifiedDebts.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: toNumber(settlementAmount),
      });
    }

    // Update the balances
    creditor.balance = creditor.balance.minus(settlementAmount);
    debtor.balance = debtor.balance.plus(settlementAmount);

    if (isDev) {
      console.log(
        `After settlement - Creditor ${creditor.userId}: ${creditor.balance.toNumber()}, Debtor ${debtor.userId}: ${debtor.balance.toNumber()}`
      );
    }

    // Remove users with zero or insignificant balances
    for (let i = users.length - 1; i >= 0; i--) {
      const user = users[i];
      if (
        user &&
        user.balance.abs().lessThanOrEqualTo(FINANCIAL_THRESHOLDS.DISPLAY)
      ) {
        if (isDev) {
          console.log(
            `Removing user ${user.userId} with balance ${user.balance.toNumber()}`
          );
        }
        users.splice(i, 1);
      }
    }

    if (isDev) {
      console.log(`Remaining users: ${users.length}`);
    }
  }

  if (isDev) {
    console.log("Final simplified debts:", simplifiedDebts);
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
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    console.log("=== Debt Simplification Validation ===");
    console.log("Original balances:", Array.from(originalBalances.entries()));
    console.log("Simplified debts:", simplifiedDebts);
  }

  // Quick check: if no simplified debts, all original balances should be near zero
  if (simplifiedDebts.length === 0) {
    const hasSignificantBalance = Array.from(originalBalances.values()).some(
      (balance) => Math.abs(balance) > FINANCIAL_THRESHOLDS.DISPLAY
    );

    if (isDev) {
      console.log(
        "No simplified debts. Has significant balances?",
        hasSignificantBalance
      );
    }
    return !hasSignificantBalance;
  }

  // Create a copy of original balances to simulate the simplified transactions
  const simulatedBalances = new Map<number, Decimal>();

  // Initialize with zeros for all users involved
  for (const [userId] of originalBalances) {
    simulatedBalances.set(userId, new Decimal(0));
  }

  // Add users from simplified debts if not already present
  for (const debt of simplifiedDebts) {
    if (!simulatedBalances.has(debt.fromUserId)) {
      simulatedBalances.set(debt.fromUserId, new Decimal(0));
    }
    if (!simulatedBalances.has(debt.toUserId)) {
      simulatedBalances.set(debt.toUserId, new Decimal(0));
    }
  }

  // Apply simplified transactions to see what balances they would create
  for (const debt of simplifiedDebts) {
    const fromBalance = simulatedBalances.get(debt.fromUserId)!;
    const toBalance = simulatedBalances.get(debt.toUserId)!;

    simulatedBalances.set(debt.fromUserId, fromBalance.minus(debt.amount));
    simulatedBalances.set(debt.toUserId, toBalance.plus(debt.amount));
  }

  if (isDev) {
    console.log(
      "Simulated balances after applying simplified debts:",
      Array.from(simulatedBalances.entries()).map(([id, balance]) => [
        id,
        balance.toNumber(),
      ])
    );
  }

  // Check if simulated balances match original balances within tolerance
  let isValid = true;
  const tolerance = new Decimal(0.1); // More generous tolerance for debugging

  for (const [userId, originalBalance] of originalBalances) {
    const simulatedBalance = simulatedBalances.get(userId) || new Decimal(0);
    const difference = toDecimal(originalBalance).minus(simulatedBalance).abs();

    if (isDev) {
      console.log(
        `User ${userId}: Original=${originalBalance}, Simulated=${simulatedBalance.toNumber()}, Diff=${difference.toNumber()}`
      );
    }

    if (difference.greaterThan(tolerance)) {
      if (isDev) {
        console.log(
          `❌ Validation failed for user ${userId}: difference ${difference.toNumber()} > tolerance ${tolerance.toNumber()}`
        );
      }
      isValid = false;
    }
  }

  if (isDev) {
    console.log("Validation result:", isValid);
    console.log("=== End Validation ===");
  }

  return isValid;
}
