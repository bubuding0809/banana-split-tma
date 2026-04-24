import { createHmac, timingSafeEqual } from "node:crypto";
import type { Target } from "@aws-sdk/client-scheduler";

export function buildRecurringExpenseScheduleName(templateId: string): string {
  return `recurring-expense-${templateId}`;
}

/**
 * HMAC-SHA256 over just the templateId. Computed once at schedule-create
 * time and embedded as a static header in the EventBridge HTTP target.
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

export interface BuildHttpTargetInput {
  templateId: string;
  webhookUrl: string;
  secret: string;
}

/**
 * EventBridge Scheduler's universal HTTP target accepts an `HttpParameters`
 * field (headers, query string, path params) that is not yet present on the
 * `Target` type in `@aws-sdk/client-scheduler@3.1021.0`. We extend the SDK
 * type so callers can construct the runtime shape AWS expects without
 * losing TypeScript safety on the SDK-known fields.
 */
export type RecurringExpenseHttpTarget = Target & {
  HttpParameters?: {
    HeaderParameters?: Record<string, string>;
    QueryStringParameters?: Record<string, string>;
    PathParameterValues?: string[];
  };
};

export function buildRecurringExpenseHttpTarget(
  input: BuildHttpTargetInput
): RecurringExpenseHttpTarget {
  const { templateId, secret } = input;
  const signature = signRecurringExpensePayload(templateId, secret);
  const scheduleName = buildRecurringExpenseScheduleName(templateId);

  // EventBridge substitutes <aws.scheduler.scheduled-time> at fire time.
  const body = JSON.stringify({
    templateId,
    scheduleName,
    occurrenceDate: "<aws.scheduler.scheduled-time>",
  });

  return {
    Arn: "arn:aws:scheduler:::http-invoke",
    RoleArn: process.env.AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN!,
    HttpParameters: {
      HeaderParameters: {
        "Content-Type": "application/json",
        "X-Recurring-Signature": signature,
      },
    },
    Input: body,
  };
}

export const RECURRING_EXPENSE_SCHEDULE_GROUP = "recurring-expenses";
