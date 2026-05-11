import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import {
  ListSchedulesCommand,
  GetScheduleCommand,
  type SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { prisma } from "@dko/database";
import {
  createGroupReminderScheduleHandler,
  reconcileSchedules,
  DEFAULT_EXPECTED_SCHEDULE,
  getSchedulerClient,
  type AwsSchedule,
  type DbChat,
} from "@dko/trpc";
import { createLogger, getRequestId, type Logger } from "@repo/logger";
import { env } from "./env.js";

const SCHEDULE_NAME_PREFIX = "group-reminder-";
const SCHEDULE_GROUP = "default";
const GET_BATCH_SIZE = 10;

const log = createLogger("lambda");

/**
 * Weekly DB↔AWS scheduler reconciliation for group-reminder schedules.
 *
 * Triggered by Vercel cron at Saturday 09:00 SGT (cron: "0 1 * * 6" UTC),
 * ~36h before the Sunday 21:00 SGT fire batch. Self-heals missing
 * schedules using the same defaults `createChat` uses today. Orphans and
 * drift are logged but never auto-mutated.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to every
 * cron invocation. Manual invocations from the operator's shell can pass
 * the same header to reproduce locally.
 */
const router = Router();

router.get(
  "/reconcile-group-reminders",
  async (req: Request, res: Response) => {
    if (!isAuthorizedCron(req)) {
      log.warn(
        {
          request_id: getRequestId(),
          reason: req.header("authorization")
            ? "cron_secret_mismatch"
            : "cron_missing_authorization",
          endpoint: "reconcile-group-reminders",
        },
        "auth.cron.failed"
      );
      return res.status(401).json({ error: "unauthorized" });
    }

    const runId = crypto.randomUUID();
    const runLog = log.child({ run_id: runId });
    runLog.info({}, "reconciliation.run.start");

    try {
      const scheduler = getSchedulerClient();
      const [dbChats, awsSchedules] = await Promise.all([
        loadGroupChats(),
        loadAllGroupReminderSchedules(scheduler, runLog),
      ]);

      const expectedArn = env.AWS_GROUP_REMINDER_LAMBDA_ARN;
      const result = reconcileSchedules(dbChats, awsSchedules, {
        scheduleExpression: DEFAULT_EXPECTED_SCHEDULE.scheduleExpression,
        timezone: DEFAULT_EXPECTED_SCHEDULE.timezone,
        targetArn: expectedArn,
      });

      let created = 0;
      let createFailed = 0;
      for (const { chatId } of result.missing) {
        try {
          await createGroupReminderScheduleHandler(
            {
              chatId,
              dayOfWeek: "sunday",
              time: "9:00pm",
              timezone: DEFAULT_EXPECTED_SCHEDULE.timezone,
              enabled: true,
            },
            // child() returns Logger<never, boolean> in pino's typings, but
            // the handler signature is Logger<string, boolean>. Cast back —
            // the structural shape is identical, this is a pino generics quirk.
            runLog as unknown as Parameters<
              typeof createGroupReminderScheduleHandler
            >[1]
          );
          runLog.info({ chat_id: chatId }, "reconciliation.schedule.created");
          created++;
        } catch (err) {
          runLog.error(
            { chat_id: chatId, err },
            "reconciliation.schedule.create.failed"
          );
          createFailed++;
        }
      }

      for (const { scheduleName } of result.orphan) {
        runLog.warn(
          { schedule_name: scheduleName },
          "reconciliation.schedule.orphaned"
        );
      }

      for (const d of result.drift) {
        runLog.warn(
          {
            chat_id: d.chatId,
            schedule_name: d.scheduleName,
            reasons: d.reasons,
          },
          "reconciliation.schedule.drift"
        );
      }

      const summary = {
        db_chats: dbChats.length,
        aws_schedules: awsSchedules.length,
        missing: result.missing.length,
        created,
        create_failed: createFailed,
        orphan: result.orphan.length,
        drift: result.drift.length,
        ok: result.ok.length,
      };
      runLog.info(summary, "reconciliation.run.complete");

      return res.status(200).json({ ok: true, runId, summary });
    } catch (err) {
      runLog.error({ err }, "reconciliation.run.failed");
      return res.status(500).json({
        ok: false,
        runId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
);

function isAuthorizedCron(req: Request): boolean {
  const auth = req.header("authorization");
  if (!auth) return false;
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (auth.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}

async function loadGroupChats(): Promise<DbChat[]> {
  const rows = await prisma.chat.findMany({
    where: { type: { in: ["group", "supergroup"] } },
    select: { id: true, type: true },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type as "group" | "supergroup",
  }));
}

async function loadAllGroupReminderSchedules(
  scheduler: SchedulerClient,
  runLog: Logger
): Promise<AwsSchedule[]> {
  const names: string[] = [];
  let nextToken: string | undefined;
  do {
    const resp = await scheduler.send(
      new ListSchedulesCommand({
        GroupName: SCHEDULE_GROUP,
        NamePrefix: SCHEDULE_NAME_PREFIX,
        MaxResults: 100,
        NextToken: nextToken,
      })
    );
    for (const s of resp.Schedules ?? []) {
      if (s.Name) names.push(s.Name);
    }
    nextToken = resp.NextToken;
  } while (nextToken);

  const details: AwsSchedule[] = [];
  for (let i = 0; i < names.length; i += GET_BATCH_SIZE) {
    const batch = names.slice(i, i + GET_BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((name) =>
        scheduler.send(
          new GetScheduleCommand({ Name: name, GroupName: SCHEDULE_GROUP })
        )
      )
    );
    batchResults.forEach((r, idx) => {
      const name = batch[idx]!;
      if (r.status === "rejected") {
        runLog.warn(
          { schedule_name: name, err: r.reason },
          "reconciliation.schedule.get.failed"
        );
        return;
      }
      const v = r.value;
      const state = v.State === "DISABLED" ? "DISABLED" : "ENABLED";
      details.push({
        name,
        state,
        scheduleExpression: v.ScheduleExpression ?? "",
        timezone: v.ScheduleExpressionTimezone ?? "",
        targetArn: v.Target?.Arn,
      });
    });
  }

  return details;
}

export default router;
