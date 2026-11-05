import type { Db } from "../../../trpc.js";

/**
 * Lazily finalise templates whose endDate has passed. EventBridge stops
 * firing at EndDate and the tick endpoint rejects late occurrences, but
 * nothing else moves the row off ACTIVE — so readers call this first.
 * Cheap: one indexed UPDATE, usually 0 rows.
 */
export async function markEndedTemplates(
  db: Db,
  scope: { chatId: bigint } | { id: string },
  now: Date = new Date()
) {
  return db.recurringExpenseTemplate.updateMany({
    where: { ...scope, status: "ACTIVE", endDate: { lt: now } },
    data: { status: "ENDED" },
  });
}
