/**
 * Pure diff function for DB chats ↔ AWS EventBridge group-reminder schedules.
 *
 * Given the current list of group/supergroup chats from Postgres and the
 * current list of `group-reminder-*` schedules from EventBridge, buckets each
 * pair into one of four states:
 *
 *   - missing  → DB chat exists, no schedule. Recon creates one with defaults.
 *   - orphan   → schedule exists, no DB chat. Logged, never auto-deleted.
 *   - drift    → schedule exists for a known chat but state/cron/tz/target
 *                drift from the expected defaults. Logged, never auto-fixed.
 *   - ok       → schedule exists and matches all defaults exactly.
 *
 * No AWS client, no DB client, no logger — just two lists in and four lists
 * out. The route handler in apps/lambda wires it to the real world.
 */
import { generateGroupReminderScheduleName } from "./groupReminderUtils.js";

export type DbChat = {
  id: bigint;
  type: "group" | "supergroup";
};

export type AwsSchedule = {
  name: string;
  state: "ENABLED" | "DISABLED";
  scheduleExpression: string;
  timezone: string;
  targetArn: string | undefined;
};

export type DriftReason = "disabled" | "wrong_cron" | "wrong_tz" | "wrong_arn";

export type ReconciliationResult = {
  missing: { chatId: string }[];
  orphan: { scheduleName: string }[];
  drift: {
    chatId: string;
    scheduleName: string;
    reasons: DriftReason[];
  }[];
  ok: { chatId: string }[];
};

export type ExpectedDefaults = {
  scheduleExpression: string;
  timezone: string;
  targetArn: string;
};

/**
 * Defaults that `createChat`'s finally block uses today. If we ever change
 * the default day/time/timezone, this constant moves with it so the recon
 * stops flagging the new default as drift.
 */
export const DEFAULT_EXPECTED_SCHEDULE = {
  scheduleExpression: "cron(0 21 ? * SUN *)",
  timezone: "Asia/Singapore",
} as const;

export function reconcileSchedules(
  chats: DbChat[],
  schedules: AwsSchedule[],
  expected: ExpectedDefaults
): ReconciliationResult {
  const scheduleByName = new Map(schedules.map((s) => [s.name, s]));
  const result: ReconciliationResult = {
    missing: [],
    orphan: [],
    drift: [],
    ok: [],
  };

  const seenScheduleNames = new Set<string>();

  for (const chat of chats) {
    const chatIdNum = Number(chat.id);
    const scheduleName = generateGroupReminderScheduleName(chatIdNum);
    const schedule = scheduleByName.get(scheduleName);
    const chatIdStr = chat.id.toString();

    if (!schedule) {
      result.missing.push({ chatId: chatIdStr });
      continue;
    }

    seenScheduleNames.add(scheduleName);

    const reasons: DriftReason[] = [];
    if (schedule.state !== "ENABLED") reasons.push("disabled");
    if (schedule.scheduleExpression !== expected.scheduleExpression) {
      reasons.push("wrong_cron");
    }
    if (schedule.timezone !== expected.timezone) reasons.push("wrong_tz");
    if (schedule.targetArn !== expected.targetArn) reasons.push("wrong_arn");

    if (reasons.length === 0) {
      result.ok.push({ chatId: chatIdStr });
    } else {
      result.drift.push({ chatId: chatIdStr, scheduleName, reasons });
    }
  }

  for (const schedule of schedules) {
    if (!seenScheduleNames.has(schedule.name)) {
      result.orphan.push({ scheduleName: schedule.name });
    }
  }

  return result;
}
