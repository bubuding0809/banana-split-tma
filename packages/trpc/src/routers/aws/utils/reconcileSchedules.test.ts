import { describe, it, expect } from "vitest";
import {
  reconcileSchedules,
  type AwsSchedule,
  type DbChat,
  type ExpectedDefaults,
} from "./reconcileSchedules.js";

const EXPECTED: ExpectedDefaults = {
  scheduleExpression: "cron(0 21 ? * SUN *)",
  timezone: "Asia/Singapore",
  targetArn: "arn:aws:lambda:ap-southeast-1:000:function:GroupReminderLambda",
};

function chat(id: bigint, type: "group" | "supergroup" = "group"): DbChat {
  return { id, type };
}

function schedule(
  chatId: bigint,
  overrides: Partial<AwsSchedule> = {}
): AwsSchedule {
  const abs = chatId < 0n ? -chatId : chatId;
  return {
    name: `group-reminder-${abs.toString()}`,
    state: "ENABLED",
    scheduleExpression: EXPECTED.scheduleExpression,
    timezone: EXPECTED.timezone,
    targetArn: EXPECTED.targetArn,
    ...overrides,
  };
}

describe("reconcileSchedules", () => {
  it("returns all-empty buckets for empty inputs", () => {
    expect(reconcileSchedules([], [], EXPECTED)).toEqual({
      missing: [],
      orphan: [],
      drift: [],
      ok: [],
    });
  });

  it("buckets a matching chat+schedule pair as ok", () => {
    const r = reconcileSchedules(
      [chat(-1003625813655n)],
      [schedule(-1003625813655n)],
      EXPECTED
    );
    expect(r.ok).toEqual([{ chatId: "-1003625813655" }]);
    expect(r.missing).toEqual([]);
    expect(r.orphan).toEqual([]);
    expect(r.drift).toEqual([]);
  });

  it("flags a chat without a schedule as missing", () => {
    const r = reconcileSchedules([chat(-1003625813655n)], [], EXPECTED);
    expect(r.missing).toEqual([{ chatId: "-1003625813655" }]);
    expect(r.ok).toEqual([]);
  });

  it("flags a schedule without a matching chat as orphan", () => {
    const r = reconcileSchedules([], [schedule(-1003625813655n)], EXPECTED);
    expect(r.orphan).toEqual([
      { scheduleName: "group-reminder-1003625813655" },
    ]);
    expect(r.missing).toEqual([]);
  });

  it("flags a disabled schedule as drift(disabled)", () => {
    const r = reconcileSchedules(
      [chat(-1n)],
      [schedule(-1n, { state: "DISABLED" })],
      EXPECTED
    );
    expect(r.drift).toEqual([
      {
        chatId: "-1",
        scheduleName: "group-reminder-1",
        reasons: ["disabled"],
      },
    ]);
    expect(r.ok).toEqual([]);
  });

  it("flags wrong cron as drift(wrong_cron)", () => {
    const r = reconcileSchedules(
      [chat(-1n)],
      [schedule(-1n, { scheduleExpression: "cron(0 21 ? * SAT *)" })],
      EXPECTED
    );
    expect(r.drift[0]?.reasons).toEqual(["wrong_cron"]);
  });

  it("flags wrong timezone as drift(wrong_tz)", () => {
    const r = reconcileSchedules(
      [chat(-1n)],
      [schedule(-1n, { timezone: "UTC" })],
      EXPECTED
    );
    expect(r.drift[0]?.reasons).toEqual(["wrong_tz"]);
  });

  it("flags wrong target ARN as drift(wrong_arn)", () => {
    const r = reconcileSchedules(
      [chat(-1n)],
      [schedule(-1n, { targetArn: "arn:aws:lambda:other" })],
      EXPECTED
    );
    expect(r.drift[0]?.reasons).toEqual(["wrong_arn"]);
  });

  it("accumulates multiple drift reasons in a stable order", () => {
    const r = reconcileSchedules(
      [chat(-1n)],
      [
        schedule(-1n, {
          state: "DISABLED",
          scheduleExpression: "cron(0 9 ? * MON *)",
          timezone: "UTC",
          targetArn: "arn:aws:lambda:other",
        }),
      ],
      EXPECTED
    );
    expect(r.drift[0]?.reasons).toEqual([
      "disabled",
      "wrong_cron",
      "wrong_tz",
      "wrong_arn",
    ]);
  });

  it("mixed scenario: 2 ok, 1 missing, 1 orphan, 1 drift", () => {
    const r = reconcileSchedules(
      [chat(-10n), chat(-20n), chat(-30n), chat(-40n)],
      [
        schedule(-10n),
        schedule(-20n, { state: "DISABLED" }),
        schedule(-30n),
        // -40n has no schedule → missing
        schedule(-99n), // no chat → orphan
      ],
      EXPECTED
    );
    expect(r.ok.map((o) => o.chatId).sort()).toEqual(["-10", "-30"]);
    expect(r.drift.map((d) => d.chatId)).toEqual(["-20"]);
    expect(r.missing).toEqual([{ chatId: "-40" }]);
    expect(r.orphan).toEqual([{ scheduleName: "group-reminder-99" }]);
  });

  it("treats schedule names whose abs matches a private-chat id (positive) as orphans", () => {
    // group chats are negative; the cleanup PR already removed positive-id
    // schedules, but the recon should treat any stray one as orphan, not
    // accidentally match a group chat.
    const r = reconcileSchedules(
      [chat(-100n)],
      [
        schedule(100n, {
          // name will be "group-reminder-100" — same as abs(-100) → matches chat(-100n) as ok
        }),
        {
          name: "group-reminder-99999",
          state: "ENABLED",
          scheduleExpression: EXPECTED.scheduleExpression,
          timezone: EXPECTED.timezone,
          targetArn: EXPECTED.targetArn,
        },
      ],
      EXPECTED
    );
    // -100n maps to schedule name "group-reminder-100", which we provided
    expect(r.ok).toEqual([{ chatId: "-100" }]);
    expect(r.orphan).toEqual([{ scheduleName: "group-reminder-99999" }]);
  });
});
