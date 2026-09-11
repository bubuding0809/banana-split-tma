/**
 * Drives the real lambda dev server over HTTP against the staging bot and
 * records every Bot API call through the recording proxy.
 *
 *   pnpm --filter lambda uat:record --label baseline
 *   pnpm --filter lambda uat:record --label grammy
 *   pnpm --filter lambda uat:diff .uat/baseline.jsonl .uat/grammy.jsonl
 *
 * Requires: apps/lambda/env/.env.development (staging TELEGRAM_BOT_TOKEN,
 * API_KEY), packages/database/.env (local postgres), docker postgres up and
 * migrated, port 8081 free. Messages land in DEV-BOX-2 and the runner's DM.
 */
import { spawn, execSync } from "node:child_process";
import { mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import { sign } from "@telegram-apps/init-data-node";
import { PrismaClient, SplitMode } from "@dko/database";
import type { AppRouter } from "@dko/trpc";
import { startRecordingProxy } from "./recording-proxy.js";
import { makePng } from "./png.js";
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

const label = arg("label", `run-${Date.now()}`);
const chatId = Number(arg("chat", "-1002371842523"));
const runnerId = Number(arg("runner", "259941064"));
const otherId = Number(arg("other", "257256809"));
const proxyPort = Number(arg("proxy-port", "8082"));
const expectedBot = arg("bot", "BananaSplitzStgBot");
const outDir = resolve(lambdaRoot, ".uat");
const logPath = resolve(outDir, `${label}.jsonl`);
const summaryPath = resolve(outDir, `${label}.summary.json`);
const base = "http://localhost:8081";

const token = process.env.TELEGRAM_BOT_TOKEN;
const apiKey = process.env.API_KEY;
if (!token || !apiKey) {
  console.error(
    "TELEGRAM_BOT_TOKEN and API_KEY must be set (apps/lambda/env/.env.development)"
  );
  process.exit(2);
}
// TypeScript does not propagate const narrowing across a function boundary, so
// the check above does not reach main(). Re-bind at module scope where it does.
const botToken: string = token;
const adminApiKey: string = apiKey;

type StepResult = { step: string; ok: boolean; ms: number; note?: string };
const summary: StepResult[] = [];

async function step<T>(
  name: string,
  fn: () => Promise<T>,
  note?: (r: T) => string
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    summary.push({
      step: name,
      ok: true,
      ms: Date.now() - started,
      note: note?.(result),
    });
    console.log(`ok   ${name}${note ? `  ${note(result)}` : ""}`);
    return result;
  } catch (err) {
    summary.push({
      step: name,
      ok: false,
      ms: Date.now() - started,
      note: String(err),
    });
    console.error(`FAIL ${name}: ${String(err)}`);
    throw err;
  }
}

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

/**
 * The runner sends real messages and writes DB rows, so refuse to go near
 * anything but the staging bot and a local database.
 */
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
    // Never log this URL: it carries the token.
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

async function main(): Promise<void> {
  await assertSafeEnvironment();
  mkdirSync(outDir, { recursive: true });
  try {
    await fetch(`${base}/`);
    console.error(
      `something already answers on ${base}; stop your dev server first`
    );
    process.exit(2);
  } catch {
    // port free
  }

  // Lambda resolves @dko/trpc from dist, so rebuild first or the run tests stale code.
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

  let expenseId: string | undefined;
  let snapshotId: string | undefined;
  let broadcastId: string | undefined;

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

    const expenseDate = new Date("2026-09-01T00:00:00Z");
    const expenseBase = {
      chatId,
      creatorId: runnerId,
      payerId: runnerId,
      currency: "SGD",
      date: expenseDate,
      splitMode: SplitMode.EQUAL,
      participantIds: [runnerId, otherId],
      sendNotification: true,
    };

    const expense = await step(
      "expense.createExpense",
      () =>
        client.expense.createExpense.mutate({
          ...expenseBase,
          description: "UAT wire check",
          amount: 12.34,
        }),
      (e) => `expense ${e.id}`
    );
    expenseId = expense.id;

    await step(
      "telegram.sendGroupReminderMessage",
      () =>
        client.telegram.sendGroupReminderMessage.mutate({
          chatId: String(chatId),
        }),
      (r) => `messageId ${r.messageId}`
    );

    await step("expense.updateExpense", () =>
      client.expense.updateExpense.mutate({
        ...expenseBase,
        expenseId: expense.id,
        description: "UAT wire check (edited)",
        amount: 23.45,
      })
    );

    const snapshot = await step(
      "snapshot.create",
      () =>
        client.snapshot.create.mutate({
          chatId,
          creatorId: runnerId,
          title: "UAT snapshot",
          expenseIds: [expense.id],
        }),
      (s) => `snapshot ${s.id}`
    );
    snapshotId = snapshot.id;

    await step("snapshot.shareSnapshotMessage", () =>
      client.snapshot.shareSnapshotMessage.mutate({ snapshotId: snapshot.id })
    );
    await step("snapshot.renderSnapshotView(cat)", () =>
      client.snapshot.renderSnapshotView.query({
        snapshotId: snapshot.id,
        view: "cat",
        userId: runnerId,
      })
    );
    await step("snapshot.renderSnapshotView(date)", () =>
      client.snapshot.renderSnapshotView.query({
        snapshotId: snapshot.id,
        view: "date",
        userId: runnerId,
      })
    );

    await step("snapshot.delete", () =>
      client.snapshot.delete.mutate({ snapshotId: snapshot.id })
    );
    snapshotId = undefined;

    await step("expense.deleteExpense", () =>
      client.expense.deleteExpense.mutate({ expenseId: expense.id })
    );
    expenseId = undefined;

    const broadcast = await step(
      "POST /api/admin/broadcast (photo)",
      async () => {
        const form = new FormData();
        form.set("message", "UAT broadcast *hello*");
        form.set("targetUserIds", JSON.stringify([runnerId]));
        form.set(
          "file",
          new Blob([makePng(128, 128, [255, 204, 0])], { type: "image/png" }),
          "uat.png"
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
    broadcastId = broadcast.broadcastId;

    await step("admin.broadcastEdit (caption)", () =>
      client.admin.broadcastEdit.mutate({
        broadcastId: broadcast.broadcastId,
        text: "UAT broadcast (caption edited)",
      })
    );
    await step("admin.broadcastEdit (media)", () =>
      client.admin.broadcastEdit.mutate({
        broadcastId: broadcast.broadcastId,
        text: "UAT broadcast (media swapped)",
        mediaBase64: makePng(128, 128, [0, 153, 255]).toString("base64"),
        mediaKind: "photo",
        mediaFilename: "uat2.png",
      })
    );

    for (const [name, path] of [
      ["GET /api/avatar", `/api/avatar/${runnerId}`],
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
  } finally {
    // Cleanup: rows we created. Sent messages stay in Telegram for the eyeball pass.
    // Each delete is independent so one failure (P2025 for an already-deleted
    // row, a transient DB error) does not skip the rest.
    const cleanup = async (what: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        console.error(`cleanup failed: ${what}`, err);
      }
    };
    if (snapshotId) {
      const id = snapshotId;
      await cleanup("snapshot", () =>
        prisma.expenseSnapshot.delete({ where: { id } })
      );
    }
    if (expenseId) {
      const id = expenseId;
      await cleanup("expense", () => prisma.expense.delete({ where: { id } }));
    }
    if (broadcastId) {
      const id = broadcastId;
      await cleanup("broadcast deliveries", () =>
        prisma.broadcastDelivery.deleteMany({ where: { broadcastId: id } })
      );
      await cleanup("broadcast", () =>
        prisma.broadcast.delete({ where: { id } })
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
    console.log(`\nrecording: ${logPath}\nsummary:   ${summaryPath}`);
  }
}

main().then(
  () => process.exit(summary.every((s) => s.ok) ? 0 : 1),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
