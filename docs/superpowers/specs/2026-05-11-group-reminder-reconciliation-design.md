# DB ↔ AWS scheduler reconciliation for group-reminder schedules

## Summary

Add a weekly reconciliation job that diffs the Postgres `chat` table against EventBridge Scheduler and self-heals missing weekly group-reminder schedules before the next Sunday fire window. The job runs as a Vercel cron route on Saturday 9:00am SGT (~12h before the Sunday 9pm SGT batch), buckets every chat into `missing` / `present` / `orphan` / `drift`, auto-creates missing schedules with the same defaults `createChat` uses today (Sun 9pm SGT, enabled), and emits Axiom events per chat plus a single run-summary event. Orphans and drift are logged but never auto-mutated — they need human review.

A one-off cleanup PR lands first to delete the 130 existing orphan schedules so the recon doesn't spam `reconciliation.schedule.orphaned` events on every run.

## Problem / Background

On 2026-05-11 we found that group "LADS 2026" (chatId `-1003625813655`, in DB since 2026-02-20) had never received a weekly Sunday 9pm SGT summary — twelve weekly batches in a row silently skipped it.

**Root cause:** the EventBridge schedule `group-reminder-1003625813655` never existed in AWS. `createChat` (`packages/trpc/src/routers/chat/createChat.ts:82-98`) tries to create the default schedule in a `finally` block:

```ts
} finally {
  try {
    await createGroupReminderScheduleHandler(
      { chatId: input.chatId.toString(), dayOfWeek: "sunday",
        time: "9:00pm", timezone: "Asia/Singapore", enabled: true },
      log
    );
  } catch (error) {
    log.error({ err: error }, "chat.defaultSchedule.create.failed");
  }
}
```

The catch swallows everything. Before the structured-logging work that landed on 2026-05-03, this failure mode was completely silent — no Axiom event, no Vercel error log, no DB indicator. The chat exists, the schedule doesn't, the bot never fires, and the user thinks the feature is broken.

PR #262 (2026-04-26) added an upsert-on-toggle band-aid in `updateGroupReminderSchedule.ts:182-216` — when a user opens the reminder settings page for a chat with no schedule, the update handler auto-creates one. That self-healed 143 chats the day PR #262 shipped (because the settings page is mounted on every TMA load). LADS 2026 wasn't touched until 2026-05-11 because no member opened settings in the meantime — too late for the previous Sunday batch.

**Cross-check on 2026-05-11 morning:**

| Bucket | Count | Notes |
|---|---|---|
| DB group/supergroup chats | 100 | source of truth for who should receive |
| AWS reminder schedules total | 230 | 224 enabled, 6 disabled |
| Missing (DB chat, no schedule) | 0 | LADS 2026 self-healed when a member opened settings today |
| Orphan (schedule, no DB chat) | 130 | mostly group→supergroup migration leftovers + dev/test chats |
| Present + matching defaults | 100 | the happy path |

The upsert-on-toggle band-aid works but is reactive — it depends on a member visiting the settings page. The cron-job-finally pattern can silently fail at any point (AWS env var missing, IAM regression, scheduler throttling, region outage). We need a proactive sweep that runs on a schedule we control and emits visible signals when the DB and AWS drift apart.

## Goals

1. Every DB chat has an EventBridge schedule before the next Sunday 9pm SGT fire window, even if `createChat` silently failed earlier in the week.
2. Every reconciliation run emits one summary event (`reconciliation.run.complete`) with bucket counts, plus one per-chat event for each missing/orphan/drift case.
3. An agent can answer "did anyone get skipped last week?" with a single Axiom query against `reconciliation.*` events.
4. The diff logic is unit-testable in isolation from AWS — pure function over two lists, no SDK mocks in the unit layer.

## Non-goals

- Auto-deleting orphan schedules. Some are legit migration leftovers (an old `group`-id schedule still firing while the new supergroup id has its own). Deletion needs deliberate review, not blanket cleanup.
- Auto-fixing drift (disabled state, wrong cron, wrong timezone, wrong lambda ARN). Most drift is user-intentional — they toggled it off, moved to Saturday, or switched timezones. The job logs and leaves it.
- Per-user reminders or non-group schedules. Out of scope; the recon name-prefix filter (`group-reminder-`) keeps it scoped.
- Replacing the `createChat`-finally schedule creation or the toggle-side upsert. Both stay. The recon is defense in depth, not a replacement for either path.

## Solution

A single Vercel cron route, a pure diff function, and a one-off cleanup PR that runs first to drain the existing 130-orphan backlog.

### Component 1 — One-off orphan cleanup (lands first, separate PR)

Before the recurring job ships, a one-off script audits the 130 current orphans, classifies them, and deletes the ones that are unambiguously dead. The recurring recon never runs against this backlog — that would spam 130 `reconciliation.schedule.orphaned` events every Saturday for events the team has already triaged.

Script lives at `apps/admin/scripts/reconcile-orphans-oneoff.ts`. It:

1. Lists every EventBridge schedule under `default` group with prefix `group-reminder-`, paginating through `NextToken`.
2. For each schedule, parses the chatId out of the name (`group-reminder-1234567890` → both `1234567890` and `-1234567890` candidates, since the name normalizes to absolute value).
3. Looks up both candidates in `chat` table. If neither exists, the schedule is an orphan.
4. Cross-references the migration log (`chat.migratedFromId` / `chat.migratedToId` fields added in the 2026-05-01 supergroup migration spec) to flag schedules whose chatId matches a known migration-source. These are "migration orphans" — the chat was upgraded to supergroup and the old schedule was never deleted.
5. Emits a CSV: `scheduleName,parsedChatId,classification,recommendation` where classification is one of `migration_leftover` / `dev_test_chat` / `unknown` and recommendation is `delete` / `keep` / `manual_review`.
6. Prompts the operator to review the CSV, then on a `--apply` flag deletes only the `delete` rows.

This is a one-shot human-in-the-loop drain. The recurring job assumes the orphan list is small (< 10) when it starts running.

### Component 2 — Pure diff function

New module `packages/trpc/src/routers/aws/utils/reconcileSchedules.ts`. Exports a pure function:

```ts
type DbChat = { id: bigint; type: ChatType };
type AwsSchedule = {
  name: string;
  state: "ENABLED" | "DISABLED";
  scheduleExpression: string;
  timezone: string;
  targetArn?: string;
};

type ReconciliationResult = {
  missing: { chatId: string }[];        // DB chat, no AWS schedule
  orphan: { scheduleName: string }[];   // AWS schedule, no DB chat
  drift: {
    chatId: string;
    scheduleName: string;
    reasons: ("disabled" | "wrong_cron" | "wrong_tz" | "wrong_arn")[];
  }[];
  ok: { chatId: string }[];             // schedule exists and matches defaults
};

export function reconcileSchedules(
  chats: DbChat[],
  schedules: AwsSchedule[],
  expectedArn: string,
): ReconciliationResult
```

The function is fully deterministic — pass two lists, get four buckets back. No AWS client, no DB client, no logger. Unit tests cover:

- Empty DB + empty AWS → all four buckets empty
- DB chat, no schedule → `missing`
- Schedule, no DB chat → `orphan`
- Match + correct cron + correct tz + correct ARN + enabled → `ok`
- Match + disabled → `drift` with reason `disabled`
- Match + cron `cron(0 21 ? * SAT *)` → `drift` with reason `wrong_cron`
- Match + tz `UTC` → `drift` with reason `wrong_tz`
- Match + different lambda ARN → `drift` with reason `wrong_arn`
- Group-id and supergroup-id collision (e.g. schedule named for migrated-from chat) → orphan, not match

"Defaults" for the recon are the same constants `createChat` uses: cron `cron(0 21 ? * SUN *)` (21:00 = 9pm 24h), timezone `Asia/Singapore`, ARN `process.env.AWS_GROUP_REMINDER_LAMBDA_ARN`. If we ever change those, both `createChat` and the recon update together.

### Component 3 — Vercel cron route

New route `apps/web/src/app/api/cron/reconcile-group-reminders/route.ts`. Protected by Vercel's built-in `CRON_SECRET` header check, same pattern as any other cron we add later.

Pseudocode:

```ts
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min, well above the ~10s we expect

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const log = createLogger("lambda").child({ job: "reconcile-group-reminders" });
  const runId = crypto.randomUUID();
  log.info({ run_id: runId }, "reconciliation.run.start");

  try {
    const [chats, schedules] = await Promise.all([
      db.chat.findMany({
        where: { type: { in: ["group", "supergroup"] } },
        select: { id: true, type: true },
      }),
      listAllGroupReminderSchedules(),  // paginated, see Component 4
    ]);

    const expectedArn = process.env.AWS_GROUP_REMINDER_LAMBDA_ARN!;
    const result = reconcileSchedules(chats, schedules, expectedArn);

    // Auto-create missing
    let created = 0, createFailed = 0;
    for (const { chatId } of result.missing) {
      try {
        await createGroupReminderScheduleHandler({
          chatId, dayOfWeek: "sunday", time: "9:00pm",
          timezone: "Asia/Singapore", enabled: true,
        }, log);
        log.info({ run_id: runId, chat_id: chatId }, "reconciliation.schedule.created");
        created++;
      } catch (err) {
        log.error({ run_id: runId, chat_id: chatId, err }, "reconciliation.schedule.create.failed");
        createFailed++;
      }
    }

    // Log orphans (no mutation)
    for (const { scheduleName } of result.orphan) {
      log.warn({ run_id: runId, schedule_name: scheduleName }, "reconciliation.schedule.orphaned");
    }

    // Log drift (no mutation)
    for (const d of result.drift) {
      log.warn({ run_id: runId, chat_id: d.chatId, schedule_name: d.scheduleName, reasons: d.reasons }, "reconciliation.schedule.drift");
    }

    log.info({
      run_id: runId,
      db_chats: chats.length,
      aws_schedules: schedules.length,
      missing: result.missing.length,
      created,
      create_failed: createFailed,
      orphan: result.orphan.length,
      drift: result.drift.length,
      ok: result.ok.length,
    }, "reconciliation.run.complete");

    return Response.json({ ok: true, runId, summary: {/* ... */} });
  } catch (err) {
    log.error({ run_id: runId, err }, "reconciliation.run.failed");
    return Response.json({ ok: false, runId }, { status: 500 });
  }
}
```

Per-chat `createSchedule` calls are sequential, not parallel — 100 chats × ~200ms is 20s, well under the 5min route budget, and sequential avoids EventBridge `CreateSchedule` rate limits (default 50 TPS per region but we don't need the parallelism).

### Component 4 — Pagination for `ListSchedules`

`ListSchedulesCommand` returns up to 100 results per call. Live env has 230, so we always need to paginate.

```ts
async function listAllGroupReminderSchedules() {
  const client = getSchedulerClient();
  const all: AwsSchedule[] = [];
  let nextToken: string | undefined;
  do {
    const resp = await client.send(new ListSchedulesCommand({
      GroupName: "default",
      NamePrefix: "group-reminder-",
      MaxResults: 100,
      NextToken: nextToken,
    }));
    for (const s of resp.Schedules ?? []) {
      // ListSchedulesCommand returns summary only; we need GetSchedule for
      // ScheduleExpression / Timezone / Target. Fetch in parallel batches of 10.
      all.push(await fetchScheduleDetails(client, s.Name!));
    }
    nextToken = resp.NextToken;
  } while (nextToken);
  return all;
}
```

`ListSchedulesCommand` only returns name/state/arn — not the cron expression, timezone, or target. For the drift bucket we need those, so we follow up with `GetScheduleCommand` per schedule. 230 × ~50ms sequential = ~12s; batching in chunks of 10 in parallel brings it under 3s. Either fits comfortably.

### Component 5 — Cron registration

`apps/web/vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/reconcile-group-reminders",
      "schedule": "0 1 * * 6"
    }
  ]
}
```

`0 1 * * 6` is 01:00 UTC every Saturday = **09:00 SGT Saturday**, which is ~36h before the Sunday 21:00 SGT fire window. That gives plenty of buffer: a missing schedule heals on Saturday morning and fires correctly on Sunday evening. If the cron itself errors, we still have most of Sunday to notice via Axiom monitors and re-run manually.

`CRON_SECRET` env var goes in Vercel project settings (Production + Preview).

### Hosting choice: Vercel cron route vs new Lambda

Picked Vercel cron route over a new AWS Lambda. Reasoning:

| Factor | Vercel cron route | New AWS Lambda |
|---|---|---|
| Ops surface | one `vercel.json` line, one route file | new lambda, new schedule, new IAM, new deploy pipeline |
| DB access | Prisma + Supabase already wired into `apps/web` | needs new env vars + connection pool inside lambda |
| AWS SDK access | `@aws-sdk/client-scheduler` already used by `packages/trpc` — IAM creds via env vars already shipped to Vercel | native IAM role on the lambda (slightly cleaner credential story) |
| Failure visibility | shares the Axiom logger we just instrumented in `@repo/logger` | needs separate log forwarding setup |
| Cold start / latency | irrelevant for a once-a-week job | irrelevant |
| Cost | included | a few cents/month |

The only real win for a Lambda is "AWS calls happen from inside AWS." But the existing tRPC paths in `packages/trpc/src/routers/aws/*` already make Scheduler API calls from Vercel using the same IAM access keys, so we'd be duplicating that wiring for negligible benefit. Vercel cron wins on ops simplicity.

### IAM permissions

The Vercel environment already has IAM credentials (env: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) attached to the role that backs all existing `packages/trpc/src/routers/aws/*` calls. That role currently has:

- `scheduler:CreateSchedule`
- `scheduler:UpdateSchedule`
- `scheduler:DeleteSchedule`
- `scheduler:GetSchedule`
- `iam:PassRole` on the scheduler-to-lambda role

The recon needs one additional action: `scheduler:ListSchedules`. Confirm via the AWS console or the existing terraform/CDK definition for the role before merging. If not already present, add it in the same PR that adds the cron route (Component 6).

## Observability

Six Axiom event names:

| Event | Level | When | Fields |
|---|---|---|---|
| `reconciliation.run.start` | info | once at top of run | `run_id` |
| `reconciliation.run.complete` | info | once at end of successful run | `run_id`, `db_chats`, `aws_schedules`, `missing`, `created`, `create_failed`, `orphan`, `drift`, `ok` |
| `reconciliation.run.failed` | error | top-level catch | `run_id`, `err` |
| `reconciliation.schedule.created` | info | per missing chat healed | `run_id`, `chat_id` |
| `reconciliation.schedule.create.failed` | error | per failed heal attempt | `run_id`, `chat_id`, `err` |
| `reconciliation.schedule.orphaned` | warn | per orphan schedule | `run_id`, `schedule_name` |
| `reconciliation.schedule.drift` | warn | per drifting schedule | `run_id`, `chat_id`, `schedule_name`, `reasons` |

Axiom monitor at launch: alert if any run emits `create_failed > 0`, or if `reconciliation.run.complete` doesn't show up by Saturday 10:00 SGT (i.e. cron silently didn't run). One alert, two trigger conditions.

The summary event is what makes "did this run, and was anything weird?" a single query:

```apl
['banana-split-prod']
| where ['msg'] == "reconciliation.run.complete"
| sort by _time desc
| take 8
```

## Failure modes

- **`listSchedules` errors out partway through pagination.** Top-level catch logs `reconciliation.run.failed` with the AWS error code. We don't attempt the create-missing pass because the schedule list is incomplete — would risk double-creating in cases where pagination broke after seeing the first page. Operator re-runs manually after AWS recovers.
- **`createSchedule` fails for one chat.** Logged as `reconciliation.schedule.create.failed`, the loop continues. The chat stays missing until the next run (or the toggle-side upsert). Acceptable — the loop should never abort the whole batch for one chat.
- **`getSchedule` fails for one schedule (pagination batch).** Skip that schedule (treat as if absent for drift purposes, but it won't end up as missing because the name still came back from `ListSchedules`). Log a `reconciliation.schedule.get.failed` warning. Drift detection for that one chat is deferred to next run.
- **Cron fires but route times out (> 5 min).** Vercel kills the function. Axiom monitor fires because no `reconciliation.run.complete` lands. Operator re-runs. This is extremely unlikely at current scale (100 chats); we'd revisit only when the chat count crosses ~1000.
- **Retry policy.** No in-route retry. AWS SDK already retries individual API calls with exponential backoff. If the whole run fails, the monitor fires and a human re-runs — automated retry would mask sustained AWS outages and isn't worth the complexity for a weekly job.

## Cadence: why Saturday morning, not daily

Considered alternatives:

| Cadence | Pro | Con | Verdict |
|---|---|---|---|
| Daily | Catches missing chats fast | 7× the cost for a problem that bites once a week | overkill |
| Twice a week (Wed + Sat) | Buffer + double-coverage | First run is wasted; weekly hits the same target | unnecessary |
| **Saturday 09:00 SGT** | ~36h before fire window | One miss per week could go undetected if Saturday's run breaks | **chosen** |
| Sunday morning (4-6h before fire) | Just-in-time | If Saturday-and-Sunday both miss, the user notices first | too tight |
| Friday evening | Same buffer, no real diff | Saturday morning aligns better with on-call attention | no |

Saturday morning is the right tradeoff. The Axiom monitor on missing `reconciliation.run.complete` catches a silent cron failure with most of the day to manually re-run.

## Test plan

**Unit (`reconcileSchedules.test.ts`).** Pure function tests covering all eight cases in Component 2. No mocks, no fixtures — synthetic input arrays.

**Integration (route handler).** Test against a mock `SchedulerClient` (using `aws-sdk-client-mock`) with three scenarios:

1. 3 DB chats, 1 schedule that matches one of them → expect 2 creates, 0 orphans, 0 drift, summary event.
2. 0 DB chats, 2 schedules → expect 0 creates, 2 orphans, 0 drift.
3. `ListSchedulesCommand` throws after first page → expect `reconciliation.run.failed`, no creates attempted, route returns 500.

**Dry-run in dev.** New `DRY_RUN=1` env var. When set, the route reports what it *would* do (counts + per-chat events at `info`) but skips the `createGroupReminderScheduleHandler` call entirely. Operator runs this manually against prod data once before the PR merges:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" \
     -H "x-dry-run: 1" \
     https://banana-split-tma.vercel.app/api/cron/reconcile-group-reminders
```

Confirms the diff matches the manual cross-check (0 missing, 0 orphans after the cleanup PR, 0 drift, 100 ok).

**Post-deploy UAT.** Saturday after the first scheduled run, query Axiom for the latest `reconciliation.run.complete` event. Assert: `db_chats == aws_schedules`, `missing == created`, `create_failed == 0`. If a real missing chat shows up, verify the schedule now exists in the AWS console and that the chat receives its reminder on Sunday evening.

## Rollout

Two PRs, in order:

1. **`chore(aws): one-off orphan schedule cleanup`** — `apps/admin/scripts/reconcile-orphans-oneoff.ts`, CSV review, operator deletes the 130 orphans manually after review. No recurring code in this PR.
2. **`feat(aws): weekly db↔scheduler reconciliation cron`** — pure diff function + unit tests, route handler + integration tests, `vercel.json` cron entry, `CRON_SECRET` env var setup doc, Axiom monitor configured by hand in the UI, AGENTS.md "reconciliation runbook" section. Dry-run executed once manually before merge.

Manual setup after PR #2 merges:

1. Add `CRON_SECRET` to Vercel project (Production + Preview), value generated with `openssl rand -hex 32`.
2. Confirm IAM role has `scheduler:ListSchedules` (add if missing).
3. Create the Axiom monitor (single alert, two conditions).
4. Watch the first Saturday-morning run land in Axiom.

## Out of scope (explicit)

- Auto-delete of orphans on subsequent runs — manual review only.
- Auto-fix of drift — log only, user-intentional in most cases.
- Per-user / non-group schedules.
- A UI to view recon results — Axiom query is enough.
- Triggering an ad-hoc reconciliation from the bot (e.g. `/reconcile` admin command) — overkill for now.
- Backfilling reminder-misses for chats that were missing — those summaries are gone; we don't retro-fire.
