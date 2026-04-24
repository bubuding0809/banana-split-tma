import { createHmac, timingSafeEqual } from "node:crypto";

export function buildRecurringExpenseScheduleName(templateId: string): string {
  return `recurring-expense-${templateId}`;
}

/**
 * HMAC-SHA256 over just the templateId. Computed by the external
 * RecurringExpenseLambda for each fire and verified by the Vercel
 * webhook endpoint. Kept here so Task 10's webhook can verify what
 * the Lambda will sign.
 *
 * Replay protection lives elsewhere:
 *   - Unique index on (recurringTemplateId, date) blocks duplicate writes.
 *   - The endpoint checks |now - occurrenceDate| <= 15 min for freshness.
 *   - The endpoint checks occurrenceDate <= template.endDate.
 */
export function signRecurringExpensePayload(
  templateId: string,
  secret: string
): string {
  return createHmac("sha256", secret).update(templateId).digest("hex");
}

export function verifyRecurringExpenseSignature(
  templateId: string,
  providedSignature: string,
  secret: string
): boolean {
  const expected = signRecurringExpensePayload(templateId, secret);
  if (expected.length !== providedSignature.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(providedSignature, "hex")
    );
  } catch {
    return false;
  }
}

export const RECURRING_EXPENSE_SCHEDULE_GROUP = "recurring-expenses";
