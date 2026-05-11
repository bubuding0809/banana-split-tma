/**
 * Cleanup script for EventBridge orphan group-reminder schedules.
 *
 * Background: PR #262 (2026-04-26) added an upsert-on-toggle fallback in
 * updateGroupReminderScheduleHandler — when a user opens the reminder
 * settings page and no schedule exists for the chat, one gets created.
 * That path doesn't filter by chat type, so private chats (chatId equals
 * the user's own id) end up with group-reminder-<userId> schedules that
 * never make sense to fire. We found 130 such orphans on 2026-05-11.
 *
 * Usage:
 *   pnpm tsx packages/database/scripts/cleanup-orphan-reminder-schedules.ts
 *     # dry-run: lists every orphan with classification + recommendation,
 *     # writes CSV to /tmp/orphan-reminder-schedules-<ts>.csv
 *
 *   pnpm tsx packages/database/scripts/cleanup-orphan-reminder-schedules.ts --apply
 *     # deletes every schedule classified as `wrong_chat_type` (the safe
 *     # bucket — private chats that shouldn't have a group reminder).
 *     # truly_orphan rows still need manual review and are NEVER auto-deleted.
 *
 * Required env: DATABASE_URL, AWS_REGION (defaults to ap-southeast-1),
 *               plus local AWS credentials (~/.aws/credentials).
 */
import {
  SchedulerClient,
  ListSchedulesCommand,
  DeleteScheduleCommand,
  type ScheduleSummary,
} from "@aws-sdk/client-scheduler";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "../generated/client/index.js";

const SCHEDULE_NAME_PREFIX = "group-reminder-";
const SCHEDULE_GROUP = "default";

type Classification = "ok_group" | "wrong_chat_type" | "truly_orphan";

type Recommendation = "keep" | "delete" | "manual_review";

type Row = {
  scheduleName: string;
  absChatId: bigint;
  state: string;
  createdDate: string;
  classification: Classification;
  recommendation: Recommendation;
  notes: string;
};

async function listAllGroupReminderSchedules(
  client: SchedulerClient
): Promise<ScheduleSummary[]> {
  const all: ScheduleSummary[] = [];
  let nextToken: string | undefined;
  do {
    const resp = await client.send(
      new ListSchedulesCommand({
        GroupName: SCHEDULE_GROUP,
        NamePrefix: SCHEDULE_NAME_PREFIX,
        MaxResults: 100,
        NextToken: nextToken,
      })
    );
    all.push(...(resp.Schedules ?? []));
    nextToken = resp.NextToken;
  } while (nextToken);
  return all;
}

function parseAbsChatId(scheduleName: string): bigint | null {
  const match = /^group-reminder-(\d+)$/.exec(scheduleName);
  return match?.[1] ? BigInt(match[1]) : null;
}

function classify(
  absChatId: bigint,
  groupChatIds: Set<bigint>,
  privateChatIds: Set<bigint>
): {
  classification: Classification;
  recommendation: Recommendation;
  notes: string;
} {
  // EventBridge schedule names normalize to abs(chatId), so both the
  // positive form (private chat id == user id) and the negative form
  // (-absChatId == group chat id) could be the underlying chatId.
  const asGroupId = -absChatId;
  if (groupChatIds.has(asGroupId)) {
    return {
      classification: "ok_group",
      recommendation: "keep",
      notes: `matches group/supergroup chat ${asGroupId}`,
    };
  }
  if (privateChatIds.has(absChatId)) {
    return {
      classification: "wrong_chat_type",
      recommendation: "delete",
      notes: `matches private chat (userId ${absChatId}); group-reminder makes no sense here`,
    };
  }
  return {
    classification: "truly_orphan",
    recommendation: "manual_review",
    notes: "no Chat row matches either sign of this id",
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const region = process.env.AWS_REGION || "ap-southeast-1";

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  console.log(`mode: ${apply ? "APPLY (will delete)" : "dry-run (read-only)"}`);
  console.log(`aws region: ${region}`);
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log(`db: ${url.hostname}${url.pathname}`);
  } catch {
    console.log("db: (unable to parse DATABASE_URL)");
  }

  const db = new PrismaClient();
  const scheduler = new SchedulerClient({ region });

  let rows: Row[] = [];
  try {
    const [chats, schedules] = await Promise.all([
      db.chat.findMany({ select: { id: true, type: true, title: true } }),
      listAllGroupReminderSchedules(scheduler),
    ]);

    const groupChatIds = new Set<bigint>();
    const privateChatIds = new Set<bigint>();
    for (const c of chats) {
      if (c.type === "group" || c.type === "supergroup") {
        groupChatIds.add(c.id);
      } else if (c.type === "private") {
        privateChatIds.add(c.id);
      }
    }

    console.log(
      `\nfetched ${schedules.length} aws schedules, ` +
        `${groupChatIds.size} db group/supergroup chats, ` +
        `${privateChatIds.size} db private chats`
    );

    rows = schedules
      .map((s): Row | null => {
        const name = s.Name;
        if (!name) return null;
        const absChatId = parseAbsChatId(name);
        if (absChatId === null) return null;
        const { classification, recommendation, notes } = classify(
          absChatId,
          groupChatIds,
          privateChatIds
        );
        return {
          scheduleName: name,
          absChatId,
          state: s.State ?? "?",
          createdDate: s.CreationDate?.toISOString().slice(0, 10) ?? "",
          classification,
          recommendation,
          notes,
        };
      })
      .filter((r): r is Row => r !== null);

    const byClass = rows.reduce<Record<Classification, number>>(
      (acc, r) => {
        acc[r.classification] = (acc[r.classification] ?? 0) + 1;
        return acc;
      },
      { ok_group: 0, wrong_chat_type: 0, truly_orphan: 0 }
    );
    console.log("\nclassification:");
    for (const [k, v] of Object.entries(byClass)) console.log(`  ${k}: ${v}`);

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const csvPath = `/tmp/orphan-reminder-schedules-${ts}.csv`;
    const header =
      "scheduleName,absChatId,state,createdDate,classification,recommendation,notes\n";
    const body = rows
      .map((r) =>
        [
          r.scheduleName,
          r.absChatId.toString(),
          r.state,
          r.createdDate,
          r.classification,
          r.recommendation,
          JSON.stringify(r.notes),
        ].join(",")
      )
      .join("\n");
    writeFileSync(csvPath, header + body + "\n");
    console.log(`\ncsv: ${csvPath}`);

    if (!apply) {
      const toDelete = rows.filter((r) => r.recommendation === "delete");
      console.log(
        `\ndry-run: would delete ${toDelete.length} schedule(s) classified as wrong_chat_type`
      );
      console.log(
        "re-run with --apply to delete; truly_orphan rows are never auto-deleted"
      );
      return;
    }

    const toDelete = rows.filter((r) => r.recommendation === "delete");
    console.log(`\napplying: deleting ${toDelete.length} schedule(s)...`);
    let deleted = 0;
    let failed = 0;
    for (const r of toDelete) {
      try {
        await scheduler.send(
          new DeleteScheduleCommand({
            Name: r.scheduleName,
            GroupName: SCHEDULE_GROUP,
          })
        );
        deleted++;
        if (deleted % 10 === 0)
          console.log(`  deleted ${deleted}/${toDelete.length}`);
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  FAILED ${r.scheduleName}: ${msg}`);
      }
    }
    console.log(`\ndone. deleted=${deleted} failed=${failed}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
