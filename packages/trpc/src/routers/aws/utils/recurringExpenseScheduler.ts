import { createHmac, timingSafeEqual } from "node:crypto";

export function buildRecurringExpenseScheduleName(templateId: string): string {
  return `recurring-expense-${templateId}`;
}

/**
 * HMAC-SHA256 over `${templateId}|${occurrenceDate}`. Computed by the
 * external RecurringExpenseLambda for each fire and verified by the Vercel
 * webhook endpoint. The `|` separator is safe because ISO timestamps
 * contain `:`, `-`, and `T` but never `|`.
 *
 * Including occurrenceDate in the HMAC scope means a captured signature
 * for one occurrence cannot be replayed against a different occurrenceDate
 * for the same template.
 *
 * Other replay protection:
 *   - Unique index on (recurringTemplateId, date) blocks duplicate writes.
 *   - The endpoint checks |now - occurrenceDate| <= 15 min for freshness.
 *   - The endpoint checks occurrenceDate <= template.endDate.
 */
export function signRecurringExpensePayload(
  templateId: string,
  occurrenceDate: string,
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(`${templateId}|${occurrenceDate}`)
    .digest("hex");
}

export function verifyRecurringExpenseSignature(
  templateId: string,
  occurrenceDate: string,
  providedSignature: string,
  secret: string
): boolean {
  const expected = signRecurringExpensePayload(
    templateId,
    occurrenceDate,
    secret
  );
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
