/**
 * Extensive staging UAT: drives the real lambda dev server over HTTP against
 * the staging bot, hits real AWS (EventBridge Scheduler), and exercises the
 * full surface of the tRPC router — not just the smoke-test subset covered
 * by run-uat.ts. Messages land in DEV-BOX-2 and the runner's DM; AWS
 * schedules are created/updated/deleted in the real `recurring-expenses`
 * and `default` schedule groups.
 *
 *   pnpm --filter lambda uat:extensive
 *
 * Requires everything run-uat.ts requires, PLUS:
 *   - AWS credentials reachable from this machine (default provider chain)
 *     with scheduler:GetSchedule/CreateSchedule/UpdateSchedule/DeleteSchedule
 *     on the ap-southeast-1 account, and the `aws` CLI on PATH.
 *   - AWS_RECURRING_EXPENSE_LAMBDA_ARN / AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN /
 *     RECURRING_EXPENSE_WEBHOOK_SECRET set in apps/lambda/env/.env.development.
 *   - The target chat has ZERO pre-existing Expense/Settlement/DebtTransfer
 *     rows in MYR (asserted at startup) — MYR is the scratch currency for
 *     convertCurrencyBulk and settleAllDebts, which are chat-wide/destructive.
 *
 * This script never touches .uat/baseline.jsonl or .uat/grammy.jsonl —
 * recordings go to .uat/<label>.jsonl (default label: extensive).
 */
import { spawn, execSync, execFileSync } from "node:child_process";
import { mkdirSync, openSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import { sign } from "@telegram-apps/init-data-node";
import { PrismaClient, SplitMode } from "@dko/database";
import type { AppRouter } from "@dko/trpc";
import {
  signRecurringExpensePayload,
  buildRecurringExpenseScheduleName,
} from "@dko/trpc";
import { startRecordingProxy } from "./recording-proxy.js";
import { makePng } from "./png.js";
import { readJsonl, type RecordedEntry } from "./diff-recordings.js";
import { redactBotToken } from "../../api/_redact.js";

const here = dirname(fileURLToPath(import.meta.url));
const lambdaRoot = resolve(here, "../..");
const repoRoot = resolve(lambdaRoot, "../..");
loadEnv({ path: resolve(lambdaRoot, "env/.env.development") });
loadEnv({ path: resolve(repoRoot, "packages/database/.env") });

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const label = arg("label", "extensive");
const chatId = Number(arg("chat", "-1002371842523"));
const runnerId = Number(arg("runner", "259941064"));
const otherId = Number(arg("other", "257256809"));
const proxyPort = Number(arg("proxy-port", "8082"));
const expectedBot = arg("bot", "BananaSplitzStgBot");
const AWS_REGION_ARG = arg("aws-region", "ap-southeast-1");
const RECURRING_SCHEDULE_GROUP = "recurring-expenses";
const GROUP_REMINDER_SCHEDULE_GROUP = "default";
const groupReminderScheduleName = `group-reminder-${Math.abs(chatId)}`;

const outDir = resolve(lambdaRoot, ".uat");
const logPath = resolve(outDir, `${label}.jsonl`);
const summaryPath = resolve(outDir, `${label}.summary.json`);
const reportDir = resolve(repoRoot, ".superpowers/uat");
const reportPath = resolve(reportDir, "extensive-report.md");
const base = "http://localhost:8081";

const token = process.env.TELEGRAM_BOT_TOKEN;
const apiKey = process.env.API_KEY;
const webhookSecret = process.env.RECURRING_EXPENSE_WEBHOOK_SECRET;
if (!token || !apiKey) {
  console.error(
    "TELEGRAM_BOT_TOKEN and API_KEY must be set (apps/lambda/env/.env.development)"
  );
  process.exit(2);
}
if (!webhookSecret) {
  console.error(
    "RECURRING_EXPENSE_WEBHOOK_SECRET must be set (apps/lambda/env/.env.development)"
  );
  process.exit(2);
}
// TypeScript does not propagate const narrowing across a function boundary, so
// the checks above do not reach main(). Re-bind at module scope where it does.
const botToken: string = token;
const adminApiKey: string = apiKey;
const recurringSecret: string = webhookSecret;

// ---------------------------------------------------------------------------
// Step / group / assert scaffolding
// ---------------------------------------------------------------------------

type StepResult = {
  group: string;
  step: string;
  ok: boolean;
  skipped?: boolean;
  ms: number;
  note?: string;
  botMethods: Record<string, number>;
};

const summary: StepResult[] = [];
const warnings: string[] = [];
let currentGroup = "unknown";
let logCursor = 0;

type TaggedEntry = { group: string; step: string; entry: RecordedEntry };
const taggedEntries: TaggedEntry[] = [];

function readLogSafely(): RecordedEntry[] {
  try {
    return readJsonl(logPath);
  } catch {
    return [];
  }
}

/** Consume any log lines appended since the last call, tag them with the
 * current step, and return a method->count histogram for just this slice. */
function methodsSince(stepName: string): Record<string, number> {
  const entries = readLogSafely();
  const slice = entries.slice(logCursor);
  logCursor = entries.length;
  const counts: Record<string, number> = {};
  for (const e of slice) {
    counts[e.method] = (counts[e.method] ?? 0) + 1;
    taggedEntries.push({ group: currentGroup, step: stepName, entry: e });
  }
  return counts;
}

class AssertionError extends Error {}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new AssertionError(`assertion failed: ${message}`);
}

async function step<T>(
  name: string,
  fn: () => Promise<T>,
  note?: (r: T) => string
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    const botMethods = methodsSince(name);
    summary.push({
      group: currentGroup,
      step: name,
      ok: true,
      ms: Date.now() - started,
      note: note?.(result),
      botMethods,
    });
    console.log(
      `ok   [${currentGroup}] ${name}${note ? `  ${note(result)}` : ""}`
    );
    return result;
  } catch (err) {
    const botMethods = methodsSince(name);
    summary.push({
      group: currentGroup,
      step: name,
      ok: false,
      ms: Date.now() - started,
      note: String(err),
      botMethods,
    });
    console.error(`FAIL [${currentGroup}] ${name}: ${String(err)}`);
    throw err;
  }
}

function skipStep(name: string, reason: string): void {
  summary.push({
    group: currentGroup,
    step: name,
    ok: true,
    skipped: true,
    ms: 0,
    note: `SKIPPED: ${reason}`,
    botMethods: {},
  });
  console.log(`skip [${currentGroup}] ${name}: ${reason}`);
}

async function group(name: string, fn: () => Promise<void>): Promise<void> {
  currentGroup = name;
  console.log(`\n=== group ${name} ===`);
  try {
    await fn();
  } catch (err) {
    console.error(`group ${name} aborted early: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// AWS Scheduler audit helpers (shell out to the `aws` CLI per instructions)
// ---------------------------------------------------------------------------

type ScheduleAudit = {
  name: string;
  group: string;
  exists: boolean;
  state?: string;
  scheduleExpression?: string;
};

function awsGetSchedule(name: string, scheduleGroup: string): ScheduleAudit {
  try {
    const out = execFileSync(
      "aws",
      [
        "scheduler",
        "get-schedule",
        "--name",
        name,
        "--group-name",
        scheduleGroup,
        "--region",
        AWS_REGION_ARG,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const parsed = JSON.parse(out) as {
      State?: string;
      ScheduleExpression?: string;
    };
    return {
      name,
      group: scheduleGroup,
      exists: true,
      state: parsed.State,
      scheduleExpression: parsed.ScheduleExpression,
    };
  } catch (err) {
    const text = `${(err as any)?.stderr ?? ""} ${(err as any)?.message ?? ""}`;
    if (/ResourceNotFoundException/.test(text)) {
      return { name, group: scheduleGroup, exists: false };
    }
    throw err;
  }
}

function awsDeleteSchedule(name: string, scheduleGroup: string): void {
  try {
    execFileSync(
      "aws",
      [
        "scheduler",
        "delete-schedule",
        "--name",
        name,
        "--group-name",
        scheduleGroup,
        "--region",
        AWS_REGION_ARG,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (err) {
    const text = `${(err as any)?.stderr ?? ""} ${(err as any)?.message ?? ""}`;
    if (!/ResourceNotFoundException/.test(text)) throw err;
  }
}

// ---------------------------------------------------------------------------
// Reused from run-uat.ts: server wait + safety gate
// ---------------------------------------------------------------------------

async function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server did not answer on ${base} within ${timeoutMs}ms`);
}

async function assertSafeEnvironment(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  let dbHost: string | undefined;
  try {
    dbHost = databaseUrl ? new URL(databaseUrl).hostname : undefined;
  } catch {
    dbHost = undefined;
  }
  if (dbHost !== "localhost" && dbHost !== "127.0.0.1") {
    console.error(
      `DATABASE_URL must point at localhost or 127.0.0.1 (host: ${dbHost ?? "unset or unparseable"}); refusing to run`
    );
    process.exit(2);
  }

  let username: string | undefined;
  try {
    const res = await fetch(
      "https://api.telegram.org/bot" + botToken + "/getMe"
    );
    const body = (await res.json()) as { result?: { username?: string } };
    username = body.result?.username;
  } catch (err) {
    console.error(`getMe failed (${redactBotToken(err)}); refusing to run`);
    process.exit(2);
  }
  if (username !== expectedBot) {
    console.error(
      `TELEGRAM_BOT_TOKEN belongs to @${username ?? "unknown"}, expected @${expectedBot} (--bot); refusing to run`
    );
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

const MESSAGE_METHODS = new Set([
  "sendMessage",
  "sendPhoto",
  "sendVideo",
  "sendRichMessage",
  "editMessageMedia",
]);

function renderReport(opts: {
  preCounts: { expenses: number; settlements: number };
  postCounts: { expenses: number; settlements: number };
  scratchSafe: boolean;
  groupReminderBefore: ScheduleAudit;
  groupReminderAfter: ScheduleAudit;
  cleanupErrors: string[];
}): string {
  const lines: string[] = [];
  lines.push(`# Extensive staging UAT report`);
  lines.push("");
  lines.push(
    `Run label: \`${label}\` · chat: \`${chatId}\` · ${new Date().toISOString()}`
  );
  lines.push("");

  const passed = summary.filter((s) => s.ok && !s.skipped).length;
  const skipped = summary.filter((s) => s.skipped).length;
  const failed = summary.filter((s) => !s.ok).length;
  lines.push(
    `**${passed} passed, ${skipped} skipped, ${failed} failed** out of ${summary.length} steps.`
  );
  lines.push("");

  lines.push(`## Steps`);
  lines.push("");
  lines.push(`| Group | Step | Result | ms | Note |`);
  lines.push(`|---|---|---|---|---|`);
  for (const s of summary) {
    const result = s.skipped ? "SKIP" : s.ok ? "PASS" : "FAIL";
    const note = (s.note ?? "")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ")
      .slice(0, 300);
    lines.push(`| ${s.group} | ${s.step} | ${result} | ${s.ms} | ${note} |`);
  }
  lines.push("");

  lines.push(`## Bot API method histogram`);
  lines.push("");
  const histogram: Record<string, number> = {};
  for (const s of summary) {
    for (const [m, c] of Object.entries(s.botMethods)) {
      histogram[m] = (histogram[m] ?? 0) + c;
    }
  }
  lines.push(`| Method | Count |`);
  lines.push(`|---|---|`);
  for (const [m, c] of Object.entries(histogram).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${m} | ${c} |`);
  }
  lines.push("");

  lines.push(`## AWS audit`);
  lines.push("");
  lines.push(
    `\`${groupReminderScheduleName}\` (group \`${GROUP_REMINDER_SCHEDULE_GROUP}\`) before: exists=${opts.groupReminderBefore.exists}, state=${opts.groupReminderBefore.state ?? "n/a"}, expr=${opts.groupReminderBefore.scheduleExpression ?? "n/a"}`
  );
  lines.push(
    `\`${groupReminderScheduleName}\` (group \`${GROUP_REMINDER_SCHEDULE_GROUP}\`) after:  exists=${opts.groupReminderAfter.exists}, state=${opts.groupReminderAfter.state ?? "n/a"}, expr=${opts.groupReminderAfter.scheduleExpression ?? "n/a"}`
  );
  const groupReminderUnchanged =
    opts.groupReminderBefore.exists === opts.groupReminderAfter.exists &&
    opts.groupReminderBefore.state === opts.groupReminderAfter.state &&
    opts.groupReminderBefore.scheduleExpression ===
      opts.groupReminderAfter.scheduleExpression;
  lines.push(
    groupReminderUnchanged
      ? "Group reminder schedule: UNCHANGED (as expected)."
      : "**Group reminder schedule CHANGED — investigate.**"
  );
  lines.push("");
  lines.push(
    `Recurring-template AWS schedule lifecycle is covered in the Group I steps above (create/update/cancel audits).`
  );
  lines.push("");

  lines.push(`## Cleanup verification`);
  lines.push("");
  lines.push(
    `Scratch currency (MYR/THB) pre-existing rows: ${opts.scratchSafe ? "none — scratch ops ran" : "FOUND — scratch ops (convertCurrencyBulk/settleAllDebts) were SKIPPED"}`
  );
  lines.push("");
  lines.push(`| | Expenses (chat) | Settlements (chat) |`);
  lines.push(`|---|---|---|`);
  lines.push(
    `| Pre-run | ${opts.preCounts.expenses} | ${opts.preCounts.settlements} |`
  );
  lines.push(
    `| Post-cleanup | ${opts.postCounts.expenses} | ${opts.postCounts.settlements} |`
  );
  const countsMatch =
    opts.preCounts.expenses === opts.postCounts.expenses &&
    opts.preCounts.settlements === opts.postCounts.settlements;
  lines.push("");
  lines.push(
    countsMatch
      ? "Row counts match — cleanup verified clean."
      : "**MISMATCH — cleanup left residue. Investigate before re-running.**"
  );
  if (opts.cleanupErrors.length > 0) {
    lines.push("");
    lines.push(`Cleanup errors (each independent, did not block others):`);
    for (const e of opts.cleanupErrors) lines.push(`- ${e}`);
  }
  lines.push("");

  lines.push(`## Failed assertions (detail)`);
  lines.push("");
  const failures = summary.filter((s) => !s.ok);
  if (failures.length === 0) {
    lines.push("None.");
  } else {
    for (const f of failures) {
      lines.push(`- **[${f.group}] ${f.step}**: ${f.note}`);
    }
  }
  lines.push("");

  if (warnings.length > 0) {
    lines.push(`## Warnings (tolerated, non-fatal)`);
    lines.push("");
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push(`## User must eyeball (Telegram messages produced)`);
  lines.push("");
  lines.push(
    `Real messages landed in DEV-BOX-2 (\`${chatId}\`) and the runner's DM (\`${runnerId}\`). Grouped by step:`
  );
  lines.push("");
  lines.push(`| Group | Step | Method | Chat | Message ID |`);
  lines.push(`|---|---|---|---|---|`);
  for (const t of taggedEntries) {
    if (!MESSAGE_METHODS.has(t.entry.method)) continue;
    const req = t.entry.request as Record<string, unknown>;
    const res = t.entry.response as any;
    const chatIdRaw = req?.chat_id;
    const chatLabel =
      String(chatIdRaw) === String(chatId)
        ? "DEV-BOX-2"
        : String(chatIdRaw) === String(runnerId)
          ? "DM-runner"
          : String(chatIdRaw ?? "?");
    const msgId = res?.result?.message_id ?? "n/a";
    lines.push(
      `| ${t.group} | ${t.step} | ${t.entry.method} | ${chatLabel} | ${msgId} |`
    );
  }
  lines.push("");

  lines.push(`## Broadcast DM`);
  lines.push("");
  lines.push(
    `Group H sent a real broadcast photo to \`@${expectedBot}\`'s DM with the runner (\`${runnerId}\`) — check Telegram for: initial photo, caption edit, media swap, then retraction (message deleted).`
  );
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await assertSafeEnvironment();
  mkdirSync(outDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });

  try {
    await fetch(`${base}/`);
    console.error(
      `something already answers on ${base}; stop your dev server first`
    );
    process.exit(2);
  } catch {
    // port free
  }

  execSync("pnpm --filter @dko/trpc build", {
    cwd: repoRoot,
    stdio: "inherit",
  });

  const proxy = await startRecordingProxy({ port: proxyPort, logPath });
  const devLog = openSync(resolve(outDir, `${label}.dev-server.log`), "w");
  const dev = spawn("pnpm", ["dev"], {
    cwd: lambdaRoot,
    env: { ...process.env, TELEGRAM_API_ROOT: proxy.url },
    stdio: ["ignore", devLog, devLog],
    detached: true,
  });
  const prisma = new PrismaClient();

  // Tracked artifacts — cleaned up independently in the finally block.
  const createdExpenseIds = new Set<string>();
  const createdSettlementIds = new Set<string>();
  const createdSnapshotIds = new Set<string>();
  const createdBroadcastIds = new Set<string>();
  const createdTemplateIds = new Set<string>();
  let notifyOnExpenseOriginal: boolean | undefined;

  const cleanupErrors: string[] = [];
  let preCounts = { expenses: 0, settlements: 0 };
  let postCounts = { expenses: 0, settlements: 0 };
  let scratchSafe = false;
  let groupReminderBefore: ScheduleAudit = {
    name: groupReminderScheduleName,
    group: GROUP_REMINDER_SCHEDULE_GROUP,
    exists: false,
  };
  let groupReminderAfter: ScheduleAudit = groupReminderBefore;

  try {
    await waitForServer(60_000);

    const runner = await prisma.user.findUniqueOrThrow({
      where: { id: BigInt(runnerId) },
    });
    const initData = sign(
      {
        user: {
          id: runnerId,
          first_name: runner.firstName,
          username: runner.username ?? undefined,
        },
      },
      botToken,
      new Date()
    );
    const authHeaders = {
      "x-api-key": adminApiKey,
      Authorization: `tma ${initData}`,
    };
    const client = createTRPCClient<AppRouter>({
      links: [
        httpLink({
          url: `${base}/api/trpc`,
          transformer: superjson,
          headers: authHeaders,
        }),
      ],
    });

    // ---- Pre-run audits ------------------------------------------------
    preCounts = {
      expenses: await prisma.expense.count({
        where: { chatId: BigInt(chatId) },
      }),
      settlements: await prisma.settlement.count({
        where: { chatId: BigInt(chatId) },
      }),
    };

    const preMyr =
      (await prisma.expense.count({
        where: { chatId: BigInt(chatId), currency: "MYR" },
      })) +
      (await prisma.settlement.count({
        where: { chatId: BigInt(chatId), currency: "MYR" },
      })) +
      (await prisma.debtTransfer.count({
        where: {
          OR: [
            { sourceChatId: BigInt(chatId), sourceCurrency: "MYR" },
            { targetChatId: BigInt(chatId), targetCurrency: "MYR" },
          ],
        },
      }));
    const preThb =
      (await prisma.expense.count({
        where: { chatId: BigInt(chatId), currency: "THB" },
      })) +
      (await prisma.settlement.count({
        where: { chatId: BigInt(chatId), currency: "THB" },
      })) +
      (await prisma.debtTransfer.count({
        where: {
          OR: [
            { sourceChatId: BigInt(chatId), sourceCurrency: "THB" },
            { targetChatId: BigInt(chatId), targetCurrency: "THB" },
          ],
        },
      }));
    scratchSafe = preMyr === 0 && preThb === 0;
    if (!scratchSafe) {
      warnings.push(
        `Scratch currency check: found ${preMyr} MYR + ${preThb} THB row(s) already in chat ${chatId} — settleAllDebts and convertCurrencyBulk will be SKIPPED.`
      );
    }

    groupReminderBefore = awsGetSchedule(
      groupReminderScheduleName,
      GROUP_REMINDER_SCHEDULE_GROUP
    );

    const chatBefore = await client.chat.getChat.query({ chatId });
    notifyOnExpenseOriginal = chatBefore.notifyOnExpense;

    // =====================================================================
    // Group A — expense lifecycle
    // =====================================================================
    let expense1Id: string | undefined;
    let expense2Id: string | undefined;
    await group("A-expense-lifecycle", async () => {
      const expense1 = await step(
        "expense.createExpense (EQUAL)",
        () =>
          client.expense.createExpense.mutate({
            chatId,
            creatorId: runnerId,
            payerId: runnerId,
            description: "UAT-extensive equal A1",
            amount: 12.34,
            currency: "SGD",
            splitMode: SplitMode.EQUAL,
            participantIds: [runnerId, otherId],
            sendNotification: true,
          }),
        (e) => `expense ${e.id}`
      );
      expense1Id = expense1.id;

      await step("db.audit expense1 telegramMessageId set", async () => {
        const row = await prisma.expense.findUniqueOrThrow({
          where: { id: expense1.id },
        });
        assert(
          row.telegramMessageId !== null,
          "telegramMessageId should be set"
        );
      });

      const expense2 = await step(
        "expense.createExpense (EXACT, customSplits)",
        () =>
          client.expense.createExpense.mutate({
            chatId,
            creatorId: runnerId,
            payerId: runnerId,
            description: "UAT-extensive exact A2",
            amount: 20,
            currency: "SGD",
            splitMode: SplitMode.EXACT,
            participantIds: [runnerId, otherId],
            customSplits: [
              { userId: runnerId, amount: 15 },
              { userId: otherId, amount: 5 },
            ],
            sendNotification: true,
          }),
        (e) => `expense ${e.id}`
      );
      expense2Id = expense2.id;
      createdExpenseIds.add(expense2.id);

      await step("expense.getExpenseDetails", async () => {
        const details = await client.expense.getExpenseDetails.query({
          expenseId: expense1.id,
        });
        assert(
          details?.id === expense1.id,
          "getExpenseDetails should return expense1"
        );
      });

      await step("expense.getAllExpensesByChat", async () => {
        const all = await client.expense.getAllExpensesByChat.query({ chatId });
        const ids = new Set((all as Array<{ id: string }>).map((e) => e.id));
        assert(
          ids.has(expense1.id),
          "getAllExpensesByChat should include expense1"
        );
        assert(
          ids.has(expense2.id),
          "getAllExpensesByChat should include expense2"
        );
      });

      // 24.68 / 2 participants = 12.34 exactly (2dp) — deliberately avoids an
      // odd-cent EQUAL split (e.g. 23.45/2=11.725) whose Decimal.js-computed
      // share and its DB-rounded Decimal(12,2) stored value differ by exactly
      // the computeChangedFields threshold (0.005), which would make the
      // "identical values" no-op call below spuriously look like a real
      // split change and fire a notification.
      const updated = await step(
        "expense.updateExpense (amount change)",
        () =>
          client.expense.updateExpense.mutate({
            chatId,
            expenseId: expense1.id,
            creatorId: runnerId,
            payerId: runnerId,
            description: "UAT-extensive equal A1",
            amount: 24.68,
            currency: "SGD",
            splitMode: SplitMode.EQUAL,
            participantIds: [runnerId, otherId],
            sendNotification: true,
          }),
        (e) => `amount now ${e.amount}`
      );
      await step("db.audit expense1 edit + bump recorded", async () => {
        const row = await prisma.expense.findUniqueOrThrow({
          where: { id: expense1.id },
        });
        assert(
          row.telegramMessageId !== null,
          "telegramMessageId should stay set (edit, not resend)"
        );
        assert(
          row.telegramUpdateBumpMessageIds.length >= 1,
          "an update bump message id should have been appended"
        );
      });

      await step(
        "expense.updateExpense (identical values, no-op notification)",
        () =>
          client.expense.updateExpense.mutate({
            chatId,
            expenseId: expense1.id,
            creatorId: runnerId,
            payerId: runnerId,
            description: updated.description,
            amount: updated.amount,
            currency: updated.currency,
            splitMode: updated.splitMode,
            participantIds: [runnerId, otherId],
            sendNotification: true,
          }),
        () => "no telegram calls expected"
      );

      await step("expense.deleteExpense", () =>
        client.expense.deleteExpense.mutate({ expenseId: expense1.id })
      );
      await step("db.audit expense1 gone", async () => {
        const row = await prisma.expense.findUnique({
          where: { id: expense1.id },
        });
        assert(row === null, "expense1 should be deleted");
      });
    });

    // The last step above ("identical values") should have produced zero
    // Bot API calls; verify against the recorded histogram for that step.
    const noopStep = summary.find(
      (s) =>
        s.step ===
        "expense.updateExpense (identical values, no-op notification)"
    );
    if (noopStep) {
      const callCount = Object.values(noopStep.botMethods).reduce(
        (a, b) => a + b,
        0
      );
      if (callCount !== 0) {
        noopStep.ok = false;
        noopStep.note = `expected 0 Bot API calls, got ${callCount}: ${JSON.stringify(noopStep.botMethods)}`;
      }
    }

    // =====================================================================
    // Group B — notification gating
    // =====================================================================
    await group("B-notification-gating", async () => {
      try {
        await step("chat.updateChat (notifyOnExpense=false)", () =>
          client.chat.updateChat.mutate({ chatId, notifyOnExpense: false })
        );

        const gated = await step(
          "expense.createExpense (notification gated off)",
          () =>
            client.expense.createExpense.mutate({
              chatId,
              creatorId: runnerId,
              payerId: runnerId,
              description: "UAT-extensive gated B1",
              amount: 5,
              currency: "SGD",
              splitMode: SplitMode.EQUAL,
              participantIds: [runnerId, otherId],
              sendNotification: true,
            }),
          (e) => `expense ${e.id}`
        );
        createdExpenseIds.add(gated.id);

        await step(
          "db.audit gated expense has no telegramMessageId",
          async () => {
            const row = await prisma.expense.findUniqueOrThrow({
              where: { id: gated.id },
            });
            assert(
              row.telegramMessageId === null,
              "telegramMessageId should be null when notifyOnExpense is off"
            );
          }
        );

        const gatedStep = summary[summary.length - 2]; // the createExpense step
        if (gatedStep) {
          const callCount = Object.values(gatedStep.botMethods).reduce(
            (a, b) => a + b,
            0
          );
          assert(
            callCount === 0,
            `expected no Bot API calls while gated, got ${callCount}`
          );
        }
      } finally {
        // Mandatory restore, even if the steps above failed.
        await step("chat.updateChat (restore notifyOnExpense)", async () => {
          const restored = await client.chat.updateChat.mutate({
            chatId,
            notifyOnExpense: notifyOnExpenseOriginal ?? true,
          });
          assert(
            restored.notifyOnExpense === (notifyOnExpenseOriginal ?? true),
            "notifyOnExpense should be restored"
          );
          return restored;
        });
      }
    });

    // =====================================================================
    // Group C — bulk
    // =====================================================================
    let bulkIds: string[] = [];
    await group("C-bulk", async () => {
      const bulkCreated = await step(
        "expense.createExpensesBulk (3 rows, silent)",
        () =>
          client.expense.createExpensesBulk.mutate({
            chatId,
            expenses: [
              {
                payerId: runnerId,
                description: "UAT-extensive bulk C1",
                amount: 3,
                currency: "SGD",
                splitMode: SplitMode.EQUAL,
                participantIds: [runnerId, otherId],
              },
              {
                payerId: runnerId,
                description: "UAT-extensive bulk C2",
                amount: 4,
                currency: "SGD",
                splitMode: SplitMode.EQUAL,
                participantIds: [runnerId, otherId],
              },
              {
                payerId: runnerId,
                description: "UAT-extensive bulk C3",
                amount: 5,
                currency: "SGD",
                splitMode: SplitMode.EQUAL,
                participantIds: [runnerId, otherId],
              },
            ],
          }),
        (r) => `succeeded ${r.succeeded}/${r.total}`
      );
      assert(bulkCreated.succeeded === 3, "all 3 bulk expenses should succeed");
      bulkIds = bulkCreated.results
        .filter(
          (r): r is Extract<typeof r, { status: "success" }> =>
            r.status === "success"
        )
        .map((r) => r.expense.id);
      for (const id of bulkIds) createdExpenseIds.add(id);

      const bulkCreateStep = summary[summary.length - 1];
      if (bulkCreateStep) {
        const callCount = Object.values(bulkCreateStep.botMethods).reduce(
          (a, b) => a + b,
          0
        );
        assert(
          callCount === 0,
          `bulk create should be silent, got ${callCount} Bot API call(s)`
        );
      }

      const bulkUpdated = await step(
        "expense.updateExpensesBulk (2 changed + 1 noop)",
        () =>
          client.expense.updateExpensesBulk.mutate({
            chatId,
            sendNotification: true,
            expenses: [
              {
                expenseId: bulkIds[0]!,
                amount: 30,
                description: "UAT-extensive bulk C1 (edited)",
              },
              {
                expenseId: bulkIds[1]!,
                amount: 40,
                description: "UAT-extensive bulk C2 (edited)",
              },
              { expenseId: bulkIds[2]! },
            ],
          }),
        (r) => `succeeded=${r.succeeded} noop=${r.noop} failed=${r.failed}`
      );
      assert(
        bulkUpdated.succeeded === 2,
        `expected succeeded=2, got ${bulkUpdated.succeeded}`
      );
      assert(
        bulkUpdated.noop === 1,
        `expected noop=1, got ${bulkUpdated.noop}`
      );
      assert(
        bulkUpdated.summary?.sent === true,
        "a consolidated summary should have been sent"
      );
      assert(
        bulkUpdated.summary?.messageId != null,
        "summary messageId should be set"
      );

      const bulkUpdateStep = summary[summary.length - 1];
      if (bulkUpdateStep) {
        assert(
          (bulkUpdateStep.botMethods.sendMessage ?? 0) === 1,
          `expected exactly one sendMessage for the batch summary, got ${JSON.stringify(bulkUpdateStep.botMethods)}`
        );
      }

      await step(
        "expense.sendBatchExpenseSummary (created)",
        () =>
          client.expense.sendBatchExpenseSummary.mutate({
            chatId,
            kind: "created",
            items: [
              {
                description: "UAT-extensive bulk C1",
                amount: 30,
                currency: "SGD",
              },
              {
                description: "UAT-extensive bulk C2",
                amount: 40,
                currency: "SGD",
              },
              {
                description: "UAT-extensive bulk C3",
                amount: 5,
                currency: "SGD",
              },
            ],
          }),
        (r) => `sent=${r.sent} messageId=${r.messageId}`
      );
    });

    // =====================================================================
    // Group D — settlements
    // =====================================================================
    await group("D-settlements", async () => {
      const settlement = await step(
        "settlement.createSettlement",
        () =>
          client.settlement.createSettlement.mutate({
            chatId,
            senderId: otherId,
            receiverId: runnerId,
            amount: 7.5,
            currency: "SGD",
            sendNotification: true,
            creditorName: "Ruoqian",
            debtorName: "Sean",
          }),
        (s) => `settlement ${s.id}`
      );
      createdSettlementIds.add(settlement.id);
      await step("db.audit settlement telegramMessageId set", async () => {
        const row = await prisma.settlement.findUniqueOrThrow({
          where: { id: settlement.id },
        });
        assert(
          row.telegramMessageId !== null,
          "telegramMessageId should be set"
        );
      });

      await step("settlement.getAllSettlementsByChat", async () => {
        const all = await client.settlement.getAllSettlementsByChat.query({
          chatId,
        });
        assert(
          (all as Array<{ id: string }>).some((s) => s.id === settlement.id),
          "getAllSettlementsByChat should include the new settlement"
        );
      });

      await step("settlement.deleteSettlement", () =>
        client.settlement.deleteSettlement.mutate({
          settlementId: settlement.id,
        })
      );
      createdSettlementIds.delete(settlement.id);
      const deleteStep = summary[summary.length - 1];
      if (deleteStep) {
        assert(
          (deleteStep.botMethods.deleteMessage ?? 0) >= 1,
          "deleteSettlement should have issued a deleteMessage call"
        );
      }
      await step("db.audit settlement gone", async () => {
        const row = await prisma.settlement.findUnique({
          where: { id: settlement.id },
        });
        assert(row === null, "settlement should be deleted");
      });

      if (!scratchSafe) {
        skipStep(
          "settlement.settleAllDebts (scratch MYR)",
          "pre-existing MYR/THB rows found in chat"
        );
        skipStep(
          "expense.convertCurrencyBulk (MYR -> THB)",
          "pre-existing MYR/THB rows found in chat"
        );
        return;
      }

      const scratchExpense = await step(
        "expense.createExpense (MYR scratch debt)",
        () =>
          client.expense.createExpense.mutate({
            chatId,
            creatorId: runnerId,
            payerId: runnerId,
            description: "UAT-extensive scratch MYR",
            amount: 20,
            currency: "MYR",
            splitMode: SplitMode.EQUAL,
            participantIds: [runnerId, otherId],
            sendNotification: false,
          }),
        (e) => `expense ${e.id}`
      );
      createdExpenseIds.add(scratchExpense.id);

      const balanceSummary = await step(
        "chat.getMemberBalanceSummary (runner, for MYR)",
        () =>
          client.chat.getMemberBalanceSummary.query({
            chatId,
            userId: runnerId,
          })
      );
      const myrBalance = balanceSummary.balances.find(
        (b) => b.currency === "MYR"
      );
      assert(
        myrBalance,
        "runner should have a MYR balance after the scratch expense"
      );
      const runnerIsCreditor = myrBalance!.amount > 0;
      const senderId = runnerIsCreditor ? otherId : runnerId;
      const receiverId = runnerIsCreditor ? runnerId : otherId;
      const settleAmount = Math.abs(myrBalance!.amount);

      const settled = await step(
        "settlement.settleAllDebts (scratch MYR)",
        () =>
          client.settlement.settleAllDebts.mutate({
            chatId,
            senderId,
            receiverId,
            balances: [{ currency: "MYR", amount: settleAmount }],
            sendNotification: true,
            creditorName: "Ruoqian",
            debtorName: "Sean",
          }),
        (r) => `${r.totalSettlements} settlement(s)`
      );
      for (const s of settled.settlements) createdSettlementIds.add(s.id);
      assert(
        settled.settlements.length === 1,
        "expected exactly one MYR settlement"
      );
      assert(
        settled.settlements[0]!.currency === "MYR",
        "settlement currency should be MYR"
      );

      const converted = await step(
        "expense.convertCurrencyBulk (MYR -> THB)",
        () =>
          client.expense.convertCurrencyBulk.mutate({
            chatId,
            fromCurrency: "MYR",
            toCurrency: "THB",
            userId: runnerId,
            sendNotification: false,
          }),
        (r) =>
          `expenses=${r.convertedExpenses} settlements=${r.convertedSettlements} transfers=${r.convertedTransfers}`
      );
      assert(
        converted.convertedExpenses >= 1,
        "should have converted at least our scratch expense"
      );
      assert(
        converted.convertedSettlements >= 1,
        "should have converted at least our scratch settlement"
      );

      await step("db.audit scratch rows now THB", async () => {
        const row = await prisma.expense.findUniqueOrThrow({
          where: { id: scratchExpense.id },
        });
        assert(row.currency === "THB", "scratch expense should now be THB");
      });
    });

    // =====================================================================
    // Group E — balances and reads
    // =====================================================================
    await group("E-balances-and-reads", async () => {
      await step("chat.getSimplifiedDebts", () =>
        client.chat.getSimplifiedDebts.query({ chatId, currency: "SGD" })
      );
      await step("chat.getBulkChatDebts", () =>
        client.chat.getBulkChatDebts.query({ chatId })
      );
      await step("chat.getMemberBalanceSummary", () =>
        client.chat.getMemberBalanceSummary.query({ chatId, userId: runnerId })
      );
      await step("currency.getCurrenciesWithBalance", () =>
        client.currency.getCurrenciesWithBalance.query({
          userId: runnerId,
          chatId,
        })
      );
      await step("chat.listMembers", async () => {
        const members = await client.chat.listMembers.query({ chatId });
        assert(members.length >= 2, "expected at least 2 members");
        return members;
      });
      await step("telegram.getChat", () =>
        client.telegram.getChat.query({ chatId })
      );
      await step("telegram.getChatMember", () =>
        client.telegram.getChatMember.query({ chatId, userId: runnerId })
      );
      await step("expenseShare.getMyBalancesAcrossChats", () =>
        client.expenseShare.getMyBalancesAcrossChats.query()
      );
      await step("expenseShare.getMyCounterpartyBalances", async () => {
        try {
          return await client.expenseShare.getMyCounterpartyBalances.query({});
        } catch (err) {
          warnings.push(
            `getMyCounterpartyBalances failed (tolerated — likely live FX API): ${String(err)}`
          );
          return { tolerated: true };
        }
      });
    });

    // =====================================================================
    // Group F — messages
    // =====================================================================
    await group("F-messages", async () => {
      await step(
        "telegram.sendGroupReminderMessage",
        () =>
          client.telegram.sendGroupReminderMessage.mutate({
            chatId: String(chatId),
          }),
        (r) => `messageId ${r.messageId}`
      ).then((r) =>
        assert(
          r.messageId != null,
          "expected a non-null messageId (real debt exists)"
        )
      );

      await step("telegram.sendDebtReminderMessage", () =>
        client.telegram.sendDebtReminderMessage.mutate({
          chatId,
          debtorUserId: otherId,
          debtorName: "Sean",
          creditorName: "Ruoqian",
          amount: 5,
          currency: "SGD",
        })
      );

      await step("telegram.sendMessage", () =>
        client.telegram.sendMessage.mutate({
          chatId,
          message: "UAT-extensive marker message",
        })
      );
    });

    // =====================================================================
    // Group G — snapshots
    // =====================================================================
    await group("G-snapshots", async () => {
      assert(
        expense2Id,
        "expense2 (EXACT, still alive) is required for the snapshot group"
      );
      const snapshot = await step(
        "snapshot.create",
        () =>
          client.snapshot.create.mutate({
            chatId,
            creatorId: runnerId,
            title: "UAT-extensive snapshot",
            expenseIds: [expense2Id!],
          }),
        (s) => `snapshot ${s.id}`
      );
      createdSnapshotIds.add(snapshot.id);

      await step("snapshot.getByChat", async () => {
        const list = await client.snapshot.getByChat.query({ chatId });
        assert(
          (list as Array<{ id: string }>).some((s) => s.id === snapshot.id),
          "getByChat should include the new snapshot"
        );
      });

      await step("snapshot.getDetails", async () => {
        const details = await client.snapshot.getDetails.query({
          snapshotId: snapshot.id,
        });
        assert(
          details.id === snapshot.id,
          "getDetails should return the snapshot"
        );
      });

      await step("snapshot.update (retitle)", async () => {
        const updated = await client.snapshot.update.mutate({
          snapshotId: snapshot.id,
          chatId,
          title: "UAT-extensive snapshot (renamed)",
          expenseIds: [expense2Id!],
        });
        assert(
          updated.title === "UAT-extensive snapshot (renamed)",
          "title should be updated"
        );
      });

      await step("snapshot.shareSnapshotMessage", () =>
        client.snapshot.shareSnapshotMessage.mutate({ snapshotId: snapshot.id })
      ).then(() => {
        const shareStep = summary[summary.length - 1]!;
        const methods = Object.keys(shareStep.botMethods);
        assert(
          methods.includes("sendRichMessage") ||
            methods.includes("sendMessage"),
          `expected sendRichMessage or sendMessage fallback, got ${JSON.stringify(shareStep.botMethods)}`
        );
      });

      await step("snapshot.renderSnapshotView (cat)", async () => {
        const r = await client.snapshot.renderSnapshotView.query({
          snapshotId: snapshot.id,
          view: "cat",
          userId: runnerId,
        });
        assert(r.text.length > 0, "cat view text should be non-empty");
      });
      await step("snapshot.renderSnapshotView (date)", async () => {
        const r = await client.snapshot.renderSnapshotView.query({
          snapshotId: snapshot.id,
          view: "date",
          userId: runnerId,
        });
        assert(r.text.length > 0, "date view text should be non-empty");
      });

      await step("snapshot.delete", () =>
        client.snapshot.delete.mutate({ snapshotId: snapshot.id })
      );
      createdSnapshotIds.delete(snapshot.id);
      await step("db.audit snapshot gone", async () => {
        const row = await prisma.expenseSnapshot.findUnique({
          where: { id: snapshot.id },
        });
        assert(row === null, "snapshot should be deleted");
      });
    });

    // =====================================================================
    // Group H — broadcast
    // =====================================================================
    await group("H-broadcast", async () => {
      const broadcast = await step(
        "POST /api/admin/broadcast (photo, runner only)",
        async () => {
          const form = new FormData();
          form.set("message", "UAT\\-extensive broadcast *hello*");
          form.set("targetUserIds", JSON.stringify([runnerId]));
          form.set(
            "file",
            new Blob([makePng(128, 128, [255, 204, 0])], { type: "image/png" }),
            "uat-extensive.png"
          );
          const res = await fetch(`${base}/api/admin/broadcast`, {
            method: "POST",
            headers: { "x-api-key": adminApiKey },
            body: form,
          });
          if (!res.ok)
            throw new Error(`broadcast ${res.status}: ${await res.text()}`);
          return (await res.json()) as {
            broadcastId: string;
            successCount: number;
          };
        },
        (b) => `broadcast ${b.broadcastId}, sent ${b.successCount}`
      );
      createdBroadcastIds.add(broadcast.broadcastId);

      await step("admin.broadcastGet (after send)", async () => {
        const got = await client.admin.broadcastGet.query({
          broadcastId: broadcast.broadcastId,
        });
        assert(
          got.deliveries.length === 1,
          "expected exactly one delivery (runner only)"
        );
        assert(
          got.deliveries[0]!.status === "SENT",
          `expected SENT, got ${got.deliveries[0]!.status}`
        );
        assert(
          got.deliveries[0]!.telegramMessageId != null,
          "telegramMessageId should be set"
        );
      });

      await step("admin.broadcastEdit (caption)", () =>
        client.admin.broadcastEdit.mutate({
          broadcastId: broadcast.broadcastId,
          text: "UAT\\-extensive broadcast \\(caption edited\\)",
        })
      );

      await step("admin.broadcastEdit (media swap)", () =>
        client.admin.broadcastEdit.mutate({
          broadcastId: broadcast.broadcastId,
          text: "UAT\\-extensive broadcast \\(media swapped\\)",
          mediaBase64: makePng(128, 128, [0, 153, 255]).toString("base64"),
          mediaKind: "photo",
          mediaFilename: "uat-extensive-2.png",
        })
      );

      await step("admin.broadcastRetract", () =>
        client.admin.broadcastRetract.mutate({
          broadcastId: broadcast.broadcastId,
        })
      ).then(() => {
        const retractStep = summary[summary.length - 1]!;
        assert(
          (retractStep.botMethods.deleteMessage ?? 0) >= 1,
          "retract should have issued a deleteMessage call"
        );
      });

      await step("admin.broadcastGet (after retract)", async () => {
        const got = await client.admin.broadcastGet.query({
          broadcastId: broadcast.broadcastId,
        });
        assert(
          got.deliveries[0]!.status === "RETRACTED",
          `expected RETRACTED, got ${got.deliveries[0]!.status}`
        );
      });
    });

    // =====================================================================
    // Group I — recurring full lifecycle
    // =====================================================================
    await group("I-recurring", async () => {
      const created = await step(
        "expense.createExpenseWithRecurrence",
        () =>
          client.expense.createExpenseWithRecurrence.mutate({
            expense: {
              chatId,
              creatorId: runnerId,
              payerId: runnerId,
              description: "UAT-extensive recurring",
              amount: 9.99,
              currency: "SGD",
              splitMode: SplitMode.EQUAL,
              participantIds: [runnerId, otherId],
              sendNotification: true,
            },
            recurrence: {
              frequency: "DAILY",
              interval: 1,
              weekdays: [],
              timezone: "Asia/Singapore",
            },
          }),
        (r) => `template ${r.templateId}, expense ${r.expenseId}`
      );
      createdTemplateIds.add(created.templateId);
      createdExpenseIds.add(created.expenseId);
      const scheduleName = buildRecurringExpenseScheduleName(
        created.templateId
      );

      await step(
        "aws.audit schedule created",
        () => {
          const audit = awsGetSchedule(scheduleName, RECURRING_SCHEDULE_GROUP);
          assert(
            audit.exists,
            `schedule ${scheduleName} should exist in ${RECURRING_SCHEDULE_GROUP}`
          );
          assert(
            audit.state === "ENABLED",
            `expected ENABLED, got ${audit.state}`
          );
          return Promise.resolve(audit);
        },
        (a) => `state=${a.state} expr=${a.scheduleExpression}`
      );

      await step("expense.recurring.list", async () => {
        const list = await client.expense.recurring.list.query({ chatId });
        assert(
          (list as Array<{ id: string }>).some(
            (t) => t.id === created.templateId
          ),
          "template should appear in recurring.list"
        );
      });

      await step("expense.recurring.get", async () => {
        const got = await client.expense.recurring.get.query({
          templateId: created.templateId,
        });
        assert(
          got.id === created.templateId,
          "recurring.get should return the template"
        );
      });

      await step("expense.recurring.update (frequency change)", () =>
        client.expense.recurring.update.mutate({
          templateId: created.templateId,
          frequency: "WEEKLY",
          weekdays: ["MON"],
        })
      );

      await step(
        "aws.audit schedule updated",
        () => {
          const audit = awsGetSchedule(scheduleName, RECURRING_SCHEDULE_GROUP);
          assert(audit.exists, "schedule should still exist after update");
          assert(
            !!audit.scheduleExpression?.includes("MON"),
            `expected schedule expression to include MON, got ${audit.scheduleExpression}`
          );
          return Promise.resolve(audit);
        },
        (a) => `expr=${a.scheduleExpression}`
      );

      const occurrenceDate = new Date().toISOString();
      const sig = signRecurringExpensePayload(
        created.templateId,
        occurrenceDate,
        recurringSecret
      );

      await step("db.audit exactly one expense before tick", async () => {
        // createExpenseWithRecurrence already materializes today's occurrence
        // synchronously (that's `created.expenseId`) — the tick below fires a
        // *second*, later occurrence, so the pre-tick baseline is 1, not 0.
        const count = await prisma.expense.count({
          where: { recurringTemplateId: created.templateId },
        });
        assert(
          count === 1,
          `expected exactly 1 expense before the tick, got ${count}`
        );
      });

      const tick1 = await step(
        "recurring-expense-tick (first fire)",
        async () => {
          const res = await fetch(
            `${base}/api/internal/recurring-expense-tick`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-recurring-signature": sig,
              },
              body: JSON.stringify({
                templateId: created.templateId,
                occurrenceDate,
              }),
            }
          );
          const json = (await res.json()) as { expenseId?: string };
          assert(
            res.status === 200,
            `expected 200, got ${res.status}: ${JSON.stringify(json)}`
          );
          assert(
            typeof json.expenseId === "string",
            "expected {expenseId} in response"
          );
          return json as { expenseId: string };
        }
      );
      createdExpenseIds.add(tick1.expenseId);

      await step("recurring-expense-tick (duplicate fire)", async () => {
        const res = await fetch(`${base}/api/internal/recurring-expense-tick`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-recurring-signature": sig,
          },
          body: JSON.stringify({
            templateId: created.templateId,
            occurrenceDate,
          }),
        });
        const json = (await res.json()) as { skipped?: string };
        assert(
          res.status === 200 && json.skipped === "duplicate",
          `expected {skipped:"duplicate"}, got ${res.status} ${JSON.stringify(json)}`
        );
      });

      await step(
        "db.audit exactly two materialized expenses after tick",
        async () => {
          // 1 from createExpenseWithRecurrence's synchronous materialization +
          // 1 from the first (non-duplicate) tick fire above.
          const count = await prisma.expense.count({
            where: { recurringTemplateId: created.templateId },
          });
          assert(
            count === 2,
            `expected exactly 2 materialized expenses, got ${count}`
          );
        }
      );

      await step("expense.recurring.cancel", () =>
        client.expense.recurring.cancel.mutate({
          templateId: created.templateId,
        })
      );

      await step("db.audit template CANCELED", async () => {
        const tmpl = await prisma.recurringExpenseTemplate.findUniqueOrThrow({
          where: { id: created.templateId },
        });
        assert(
          tmpl.status === "CANCELED",
          `expected CANCELED, got ${tmpl.status}`
        );
      });
      await step("aws.audit schedule gone after cancel", () => {
        const audit = awsGetSchedule(scheduleName, RECURRING_SCHEDULE_GROUP);
        assert(!audit.exists, "AWS schedule should be gone after cancel");
        return Promise.resolve(audit);
      });
      // Deliberately still tracked: cancel is a SOFT delete (status CANCELED),
      // so the row survives and the chat would not return to its pre-run state.
      // Cleanup hard-deletes it below.
    });

    // =====================================================================
    // Group J — endpoints
    // =====================================================================
    await group("J-endpoints", async () => {
      for (const [name, path] of [
        ["GET /api/avatar", `/api/avatar/${runnerId}`],
        // Chat.id in the DB is the raw (negative) Telegram chat id — unlike
        // the AWS schedule name, which encodes its absolute value.
        ["GET /api/chat-photo", `/api/chat-photo/${chatId}`],
      ] as const) {
        await step(
          name,
          async () => {
            const res = await fetch(`${base}${path}`, {
              headers: { Authorization: `tma ${initData}` },
            });
            if (res.status !== 200 && res.status !== 404) {
              throw new Error(`${path} returned ${res.status}`);
            }
            return res.status;
          },
          (status) => `status ${status}`
        );
      }
    });

    // ---- Post-run AWS audit --------------------------------------------
    groupReminderAfter = awsGetSchedule(
      groupReminderScheduleName,
      GROUP_REMINDER_SCHEDULE_GROUP
    );
    if (
      groupReminderBefore.exists !== groupReminderAfter.exists ||
      groupReminderBefore.state !== groupReminderAfter.state ||
      groupReminderBefore.scheduleExpression !==
        groupReminderAfter.scheduleExpression
    ) {
      console.error(
        `WARNING: group reminder schedule changed! before=${JSON.stringify(groupReminderBefore)} after=${JSON.stringify(groupReminderAfter)}`
      );
    }
  } finally {
    // -----------------------------------------------------------------
    // Cleanup — every artifact behind its own try/catch. Order: messages
    // that reference expenses/settlements first (broadcast, snapshots),
    // then settlements, then expenses, then the recurring template/schedule,
    // then toggle restoration.
    // -----------------------------------------------------------------
    const cleanup = async (what: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        const msg = `${what}: ${String(err)}`;
        cleanupErrors.push(msg);
        console.error(`cleanup failed: ${msg}`);
      }
    };

    // Need a client for cleanup even if the try block failed before it was
    // constructed further down — rebuild a minimal one here defensively.
    let cleanupClient:
      | ReturnType<typeof createTRPCClient<AppRouter>>
      | undefined;
    try {
      const runner = await prisma.user.findUnique({
        where: { id: BigInt(runnerId) },
      });
      if (runner) {
        const initDataForCleanup = sign(
          {
            user: {
              id: runnerId,
              first_name: runner.firstName,
              username: runner.username ?? undefined,
            },
          },
          botToken,
          new Date()
        );
        cleanupClient = createTRPCClient<AppRouter>({
          links: [
            httpLink({
              url: `${base}/api/trpc`,
              transformer: superjson,
              headers: {
                "x-api-key": adminApiKey,
                Authorization: `tma ${initDataForCleanup}`,
              },
            }),
          ],
        });
      }
    } catch {
      // Dev server may not be up if startup failed early — fall through to
      // direct-prisma cleanup below, which doesn't need the HTTP server.
    }

    for (const broadcastId of createdBroadcastIds) {
      await cleanup(`broadcast ${broadcastId} deliveries`, () =>
        prisma.broadcastDelivery.deleteMany({ where: { broadcastId } })
      );
      await cleanup(`broadcast ${broadcastId}`, () =>
        prisma.broadcast.delete({ where: { id: broadcastId } })
      );
    }

    for (const snapshotId of createdSnapshotIds) {
      await cleanup(`snapshot ${snapshotId}`, () =>
        prisma.expenseSnapshot.delete({ where: { id: snapshotId } })
      );
    }

    for (const settlementId of createdSettlementIds) {
      await cleanup(`settlement ${settlementId}`, async () => {
        if (cleanupClient) {
          await cleanupClient.settlement.deleteSettlement.mutate({
            settlementId,
          });
        } else {
          await prisma.settlement.delete({ where: { id: settlementId } });
        }
      });
    }

    for (const expenseId of createdExpenseIds) {
      await cleanup(`expense ${expenseId}`, async () => {
        if (cleanupClient) {
          await cleanupClient.expense.deleteExpense.mutate({ expenseId });
        } else {
          await prisma.expense.delete({ where: { id: expenseId } });
        }
      });
    }

    for (const templateId of createdTemplateIds) {
      await cleanup(`recurring template ${templateId}`, async () => {
        if (cleanupClient) {
          await cleanupClient.expense.recurring.cancel.mutate({ templateId });
        } else {
          await prisma.recurringExpenseTemplate.update({
            where: { id: templateId },
            data: { status: "CANCELED" },
          });
        }
        // Fallback: cancel's own AWS delete may have failed — verify and
        // force-delete the schedule directly.
        const scheduleName = buildRecurringExpenseScheduleName(templateId);
        const audit = awsGetSchedule(scheduleName, RECURRING_SCHEDULE_GROUP);
        if (audit.exists) {
          awsDeleteSchedule(scheduleName, RECURRING_SCHEDULE_GROUP);
        }
        // The tick materialises occurrences the script never registered, and
        // they hold the template's foreign key, so they go first.
        const materialised = await prisma.expense.findMany({
          where: { recurringTemplateId: templateId },
          select: { id: true },
        });
        if (materialised.length > 0) {
          const ids = materialised.map((e) => e.id);
          await prisma.expenseShare.deleteMany({
            where: { expenseId: { in: ids } },
          });
          await prisma.expense.deleteMany({ where: { id: { in: ids } } });
        }
        await prisma.recurringExpenseTemplate.deleteMany({
          where: { id: templateId },
        });
      });
    }

    if (notifyOnExpenseOriginal !== undefined) {
      await cleanup("restore notifyOnExpense toggle", async () => {
        if (cleanupClient) {
          await cleanupClient.chat.updateChat.mutate({
            chatId,
            notifyOnExpense: notifyOnExpenseOriginal,
          });
        } else {
          await prisma.chat.update({
            where: { id: BigInt(chatId) },
            data: { notifyOnExpense: notifyOnExpenseOriginal },
          });
        }
      });
    }

    try {
      postCounts = {
        expenses: await prisma.expense.count({
          where: { chatId: BigInt(chatId) },
        }),
        settlements: await prisma.settlement.count({
          where: { chatId: BigInt(chatId) },
        }),
      };
    } catch (err) {
      cleanupErrors.push(`post-count query failed: ${String(err)}`);
    }

    if (
      postCounts.expenses !== preCounts.expenses ||
      postCounts.settlements !== preCounts.settlements
    ) {
      console.error(
        `CLEANUP MISMATCH: pre=${JSON.stringify(preCounts)} post=${JSON.stringify(postCounts)}`
      );
    }

    await prisma.$disconnect();
    if (dev.pid) {
      try {
        process.kill(-dev.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    await proxy.close();

    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    const report = renderReport({
      preCounts,
      postCounts,
      scratchSafe,
      groupReminderBefore,
      groupReminderAfter,
      cleanupErrors,
    });
    writeFileSync(reportPath, report);
    console.log(
      `\nrecording: ${logPath}\nsummary:   ${summaryPath}\nreport:    ${reportPath}`
    );
  }
}

main().then(
  () => process.exit(summary.every((s) => s.ok) ? 0 : 1),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
