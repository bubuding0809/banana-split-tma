# Consolidate Telegram clients on grammy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace telegraf (and the unused node-telegram-bot-api) with grammy's standalone `Api` client in `packages/trpc` and `apps/lambda`, bump `apps/bot` to grammy 1.46.0, with byte-identical Bot API traffic before and after.

**Architecture:** `ctx.teleBot` keeps its name and becomes a grammy `Api`. A new optional `TELEGRAM_API_ROOT` env var lets a local recording proxy sit between the app and Telegram. Regression is proven three ways: `tsc`, a vitest wire-snapshot spec recorded while telegraf is still the client, and a staging UAT script that drives the real dev server over HTTP and diffs recorded Telegram traffic against a baseline taken before the swap.

**Tech Stack:** TypeScript, pnpm workspace, vitest, grammy 1.46.0 (`@grammyjs/types` 5.0.0, Bot API 10.3), `@trpc/client` + superjson for the UAT script, `@telegram-apps/init-data-node` for signed initData, Node 24 `fetch`/`FormData`/`Response.formData()`.

**Spec:** `docs/superpowers/specs/2026-09-11-grammy-consolidation-design.md`

## Global Constraints

- Work on branch `feat/grammy-consolidation`. Never commit to `main`. PR with squash merge; do not arm auto-merge until the user says so after UAT.
- `grammy` version: `^1.46.0` everywhere. Remove `telegraf`, `node-telegram-bot-api`, `@types/node-telegram-bot-api` completely.
- Zero behavior change: every message text, `parse_mode: "MarkdownV2"`, keyboard, thread id, and handler contract stays as is. The wire-snapshot spec (Task 2) must pass unchanged after the swap (Task 5).
- `TELEGRAM_API_ROOT` is optional, default `https://api.telegram.org`, never set in deployed environments.
- Context field name stays `teleBot`. Handler parameter names stay `teleBot`.
- Commit messages: Conventional Commits, end with the attribution block shown in each commit step.
- Shell note: this repo's shell aliases `grep` to `ugrep`, which breaks `--include`. Use `command grep` or `rg`.
- `apps/lambda` resolves `@dko/trpc` to `packages/trpc/dist`. After editing `packages/trpc/src`, run `pnpm --filter @dko/trpc build` before running anything in `apps/lambda`.
- Local DB must be migrated before UAT: `cd packages/database && pnpm exec prisma migrate status` must report no pending migrations.
- Staging test group is DEV-BOX-2 (`-1002371842523`) on `@BananaSplitzStgBot`. Runner user is Telegram id `259941064` (username `bubuding0809`), second participant `257256809`. Chat base currency `SGD`, `notifyOnExpense` and `notifyOnExpenseUpdate` are on.
- Never print the bot token. Read it from `apps/lambda/env/.env.development` inside scripts only.

---

## File Structure

**Created**

- `packages/trpc/src/testing/fakeTelegramServer.ts` — in-process fake Bot API: records `{ method, body }`, parses JSON and multipart bodies, answers with canned results. Used by Task 1 and Task 2 specs.
- `packages/trpc/src/trpc.apiRoot.spec.ts` — proves `TELEGRAM_API_ROOT` reroutes the client.
- `packages/trpc/src/testing/telegramWire.spec.ts` + `__snapshots__/telegramWire.spec.ts.snap` — wire-level snapshots of five handlers.
- `apps/lambda/api/_telegram.ts` — single factory for the lambda's Telegram client.
- `apps/lambda/api/_telegramFile.ts` + `_telegramFile.test.ts` — file download URL builder (Task 6).
- `apps/lambda/scripts/uat/wire.ts` — body parser (copy of the one in `fakeTelegramServer.ts`; lambda imports `@dko/trpc` via `dist`, so test helpers are not importable).
- `apps/lambda/scripts/uat/recording-proxy.ts` — forwarding proxy that appends JSONL.
- `apps/lambda/scripts/uat/diff-recordings.ts` + `diff-recordings.test.ts` — normalizing differ.
- `apps/lambda/scripts/uat/png.ts` + `png.test.ts` — deterministic PNG generator for upload steps.
- `apps/lambda/scripts/uat/run-uat.ts` — drives the dev server over HTTP.

**Modified**

- `packages/trpc/src/trpc.ts` — `apiRoot` plumbing (Task 1), grammy `Api` (Task 5).
- `packages/trpc/src/utils/telegram.ts` — `inlineKeyboard` helper (Task 5).
- 26 files under `packages/trpc/src` listed in Task 5 — import swap and four signature deltas.
- `packages/trpc/src/routers/telegram/editExpenseNotificationMessage.spec.ts` — positional index fix (Task 5).
- `apps/lambda/api/env.ts`, `avatar.ts`, `chat-photo.ts`, `index.ts`, `recurring-expense-tick.ts`, `_avatar.test.ts`, `_chat-photo.test.ts`, `_redact.ts` (Tasks 1, 6).
- `apps/lambda/tsconfig.json`, `apps/lambda/package.json`, `packages/trpc/package.json`, `apps/bot/package.json`, `pnpm-lock.yaml`, `.gitignore`, `AGENTS.md`.

---

### Task 1: `TELEGRAM_API_ROOT` plumbing and the fake Bot API server

**Files:**
- Create: `packages/trpc/src/testing/fakeTelegramServer.ts`
- Create: `packages/trpc/src/trpc.apiRoot.spec.ts`
- Modify: `packages/trpc/src/trpc.ts:63-92`
- Create: `apps/lambda/api/_telegram.ts`
- Modify: `apps/lambda/api/env.ts` (server schema)
- Modify: `apps/lambda/api/avatar.ts:3,14`, `apps/lambda/api/chat-photo.ts:2,13`, `apps/lambda/api/index.ts:11,177`, `apps/lambda/api/recurring-expense-tick.ts:2,167`

**Interfaces:**
- Produces: `parseTelegramBody(contentType: string, raw: Buffer): Promise<Record<string, unknown>>`, `startFakeTelegramServer(responder?): Promise<{ url: string; calls: RecordedCall[]; close(): Promise<void> }>`, `type RecordedCall = { method: string; body: Record<string, unknown> }`.
- Produces: `createTelegramClient()` in `apps/lambda/api/_telegram.ts`, returning the lambda's Telegram client (telegraf `Telegram` now, grammy `Api` after Task 6).
- Produces: `withCreateTRPCContext(env)` honours `env.TELEGRAM_API_ROOT`.

- [ ] **Step 1: Write the fake Bot API server helper**

Create `packages/trpc/src/testing/fakeTelegramServer.ts`:

```ts
import { createServer } from "node:http";
import { createHash } from "node:crypto";

export type FileSummary = { filename: string; bytes: number; sha256: string };
export type RecordedCall = { method: string; body: Record<string, unknown> };

function parseScalar(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Collapse `attach://<name>` references onto the file part they point at,
 * then append any file part that was sent directly under its own field
 * name. Both telegraf and grammy end up producing the same shape.
 */
function resolveAttachRefs(
  fields: Record<string, unknown>,
  files: Record<string, FileSummary>
): Record<string, unknown> {
  const consumed = new Set<string>();
  const walk = (value: unknown): unknown => {
    if (typeof value === "string" && value.startsWith("attach://")) {
      const name = value.slice("attach://".length);
      const file = files[name];
      if (file) {
        consumed.add(name);
        return file;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v),
        ])
      );
    }
    return value;
  };
  const out = walk(fields) as Record<string, unknown>;
  for (const [name, file] of Object.entries(files)) {
    if (!consumed.has(name)) out[name] = file;
  }
  return out;
}

/**
 * Parse a Bot API request body into a plain object. JSON bodies parse as-is.
 * Multipart bodies collapse file parts into { filename, bytes, sha256 }.
 */
export async function parseTelegramBody(
  contentType: string,
  raw: Buffer
): Promise<Record<string, unknown>> {
  if (contentType.startsWith("application/json")) {
    return raw.length
      ? (JSON.parse(raw.toString("utf8")) as Record<string, unknown>)
      : {};
  }
  if (contentType.startsWith("multipart/form-data")) {
    const form = await new Response(raw, {
      headers: { "content-type": contentType },
    }).formData();
    const fields: Record<string, unknown> = {};
    const files: Record<string, FileSummary> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        fields[key] = parseScalar(value);
      } else {
        const buf = Buffer.from(await value.arrayBuffer());
        files[key] = {
          filename: value.name,
          bytes: buf.length,
          sha256: createHash("sha256").update(buf).digest("hex"),
        };
      }
    }
    return resolveAttachRefs(fields, files);
  }
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    return Object.fromEntries(
      [...new URLSearchParams(raw.toString("utf8"))].map(([k, v]) => [
        k,
        parseScalar(v),
      ])
    );
  }
  return { raw: raw.toString("utf8") };
}

export type Responder = (
  method: string,
  body: Record<string, unknown>
) => unknown;

const photo = [
  { file_id: "photo-file-id", file_unique_id: "photo-unique", width: 1, height: 1 },
];
const video = {
  file_id: "video-file-id",
  file_unique_id: "video-unique",
  width: 1,
  height: 1,
  duration: 1,
};

export const defaultResponder: Responder = (method, body) => {
  const chat = { id: body.chat_id ?? 0, type: "private" };
  switch (method) {
    case "getMe":
      return { id: 1, is_bot: true, first_name: "Test Bot", username: "testbot" };
    case "deleteMessage":
      return true;
    case "sendPhoto":
      return { message_id: 1, date: 0, chat, photo };
    case "sendVideo":
      return { message_id: 1, date: 0, chat, video };
    case "editMessageMedia": {
      const media = body.media as { type?: string } | undefined;
      return media?.type === "video"
        ? { message_id: Number(body.message_id ?? 1), date: 0, chat, video }
        : { message_id: Number(body.message_id ?? 1), date: 0, chat, photo };
    }
    default:
      return {
        message_id: Number(body.message_id ?? 1),
        date: 0,
        chat,
        text: typeof body.text === "string" ? body.text : "",
      };
  }
};

export type FakeTelegramServer = {
  url: string;
  calls: RecordedCall[];
  close(): Promise<void>;
};

export async function startFakeTelegramServer(
  responder: Responder = defaultResponder
): Promise<FakeTelegramServer> {
  const calls: RecordedCall[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    const method = (req.url ?? "").split("?")[0]!.split("/").pop() ?? "";
    const body = await parseTelegramBody(req.headers["content-type"] ?? "", raw);
    calls.push({ method, body });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, result: responder(method, body) }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("fake telegram server did not bind a port");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}
```

- [ ] **Step 2: Write the failing apiRoot spec**

Create `packages/trpc/src/trpc.apiRoot.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { withCreateTRPCContext } from "./trpc.js";
import { startFakeTelegramServer } from "./testing/fakeTelegramServer.js";

describe("TELEGRAM_API_ROOT", () => {
  it("routes Bot API calls through the configured root", async () => {
    const server = await startFakeTelegramServer();
    try {
      const createContext = withCreateTRPCContext({
        TELEGRAM_BOT_TOKEN: "123:TEST",
        TELEGRAM_API_ROOT: server.url,
      });
      const ctx = createContext({
        req: { headers: {} },
        res: {},
        info: {},
      } as never);
      const me = await ctx.teleBot.getMe();
      expect(me.username).toBe("testbot");
      expect(server.calls.map((c) => c.method)).toEqual(["getMe"]);
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd packages/trpc && npx vitest run src/trpc.apiRoot.spec.ts`
Expected: FAIL. The client ignores `TELEGRAM_API_ROOT` and tries `https://api.telegram.org`, so the request errors or `server.calls` is empty.

- [ ] **Step 4: Plumb `apiRoot` through `createTRPCContext`**

In `packages/trpc/src/trpc.ts`, replace lines 63-92 (the `createTRPCContext` and `withCreateTRPCContext` definitions) with:

```ts
const createTRPCContext = ({
  botToken,
  apiRoot,
  ...rest
}: Record<string, unknown> & {
  botToken: string;
  apiRoot?: string;
}) => {
  const requestId = getRequestId();
  const log: Logger = trpcLogger.child({ request_id: requestId });
  return {
    db: prisma as typeof prisma,
    // apiRoot is only ever set by the local UAT recording proxy. Production
    // leaves it undefined and the client talks to api.telegram.org.
    teleBot: new Telegram(botToken, apiRoot ? { apiRoot } : undefined),
    request: rest.req,
    response: rest.res,
    info: rest.info,
    log,
  };
};

export const withCreateTRPCContext = (
  env: Readonly<{
    [key: string]: string | undefined;
  }>
) => {
  return (expressContext: CreateExpressContextOptions) =>
    createTRPCContext({
      ...expressContext,
      botToken: env.TELEGRAM_BOT_TOKEN || "",
      apiRoot: env.TELEGRAM_API_ROOT || undefined,
    });
};
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `cd packages/trpc && npx vitest run src/trpc.apiRoot.spec.ts`
Expected: PASS.

- [ ] **Step 6: Add the env var and client factory to the lambda**

In `apps/lambda/api/env.ts`, inside `server: { ... }`, add after `TELEGRAM_BOT_TOKEN`:

```ts
    // Optional. Only the local UAT recording proxy sets this so Bot API
    // traffic can be captured. Never set in a deployed environment.
    TELEGRAM_API_ROOT: z.string().url().optional(),
```

Create `apps/lambda/api/_telegram.ts`:

```ts
import { Telegram } from "telegraf";
import { env } from "./env.js";

/**
 * Single place the lambda constructs its Telegram client. Honours
 * TELEGRAM_API_ROOT so the local UAT recording proxy can sit in front of
 * api.telegram.org.
 */
export function createTelegramClient(): Telegram {
  return new Telegram(
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_API_ROOT ? { apiRoot: env.TELEGRAM_API_ROOT } : undefined
  );
}
```

Then in each of the four files:

- `apps/lambda/api/avatar.ts`: delete `import { Telegram } from "telegraf";` (line 3), add `import { createTelegramClient } from "./_telegram.js";`, change line 14 to `const teleBot = createTelegramClient();`.
- `apps/lambda/api/chat-photo.ts`: same edit at lines 2 and 13.
- `apps/lambda/api/index.ts`: delete `import { Telegram } from "telegraf";` (line 11), add `import { createTelegramClient } from "./_telegram.js";`, change line 177 to `teleBot: createTelegramClient(),`.
- `apps/lambda/api/recurring-expense-tick.ts`: delete line 2 import, add the factory import, change line 167 to `createTelegramClient()`.

- [ ] **Step 7: Verify lambda still type-checks and tests pass**

Run: `pnpm --filter @dko/trpc build && cd apps/lambda && pnpm check-types && pnpm test`
Expected: both pass. The two existing tests still `vi.mock("telegraf")`, and the factory still calls `new Telegram`, so their mocks keep working.

- [ ] **Step 8: Commit**

```bash
git add packages/trpc/src/testing/fakeTelegramServer.ts packages/trpc/src/trpc.apiRoot.spec.ts packages/trpc/src/trpc.ts apps/lambda/api/_telegram.ts apps/lambda/api/env.ts apps/lambda/api/avatar.ts apps/lambda/api/chat-photo.ts apps/lambda/api/index.ts apps/lambda/api/recurring-expense-tick.ts
git commit -m "feat(telegram): optional TELEGRAM_API_ROOT for local traffic recording

Adds an opt-in API root so a local proxy can sit between the app and
api.telegram.org. Lambda gets a single createTelegramClient() factory.
Ships a fake Bot API server test helper that parses JSON and multipart
bodies for the wire-snapshot specs that follow.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DVTrDKmmC78vNagw8mAwG4"
```

---

### Task 2: Wire-snapshot spec recorded on telegraf

**Files:**
- Create: `packages/trpc/src/testing/telegramWire.spec.ts`
- Generated: `packages/trpc/src/testing/__snapshots__/telegramWire.spec.ts.snap`

**Interfaces:**
- Consumes: `startFakeTelegramServer` from Task 1. Handlers: `sendExpenseNotificationMessageHandler(input, db, teleBot, log?)`, `editExpenseMessageHandler(input, teleBot, log?)`, `editDelivery(ctx, deliveryId, currentKind, input)`, `createBroadcast(ctx, opts)`.
- Produces: snapshot file that Task 5 must leave unchanged. The only line Task 5 edits in this spec is the client construction.

- [ ] **Step 1: Write the spec**

Create `packages/trpc/src/testing/telegramWire.spec.ts`:

```ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Telegram } from "telegraf";
import type { PrismaClient } from "@dko/database";
import type { Logger } from "@repo/logger";
import type { Db } from "../trpc.js";
import {
  startFakeTelegramServer,
  type FakeTelegramServer,
} from "./fakeTelegramServer.js";
import { sendExpenseNotificationMessageHandler } from "../routers/telegram/sendExpenseNotificationMessage.js";
import { editExpenseMessageHandler } from "../routers/telegram/editExpenseNotificationMessage.js";
import { editDelivery } from "../services/broadcastActions.js";
import { createBroadcast } from "../services/broadcast.js";

// Wire-level regression guard. Each test drives a real client against a fake
// Bot API server and snapshots the exact request bodies. The snapshot was
// recorded with telegraf; swapping the client library must not change it.

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child() {
    return log;
  },
} as unknown as Logger;

const RUNNER = 259941064n;
const PHOTO = Buffer.from("fake-photo-bytes-for-wire-snapshot");

const expenseInput = {
  chatId: -1002371842523,
  chatType: "group",
  expenseId: "123e4567-e89b-12d3-a456-426614174000",
  payerId: 1,
  payerName: "Alice",
  creatorUserId: 1,
  creatorName: "Alice",
  expenseDescription: "Lunch (wire)",
  totalAmount: 20,
  participants: [
    { userId: 1, name: "Alice", amount: 10 },
    { userId: 2, name: "Bob", amount: 10 },
  ],
  currency: "SGD",
  expenseDate: new Date("2026-04-24T00:00:00Z"),
  chatTimezone: "Asia/Singapore",
  threadId: 147,
};

describe("telegram wire snapshots", () => {
  let server: FakeTelegramServer;
  let teleBot: Telegram;

  beforeAll(async () => {
    server = await startFakeTelegramServer();
    // Task 5 changes only this line to `new Api("123:TEST", { apiRoot: server.url })`.
    teleBot = new Telegram("123:TEST", { apiRoot: server.url });
  });

  afterAll(async () => {
    await server.close();
  });

  it("sendMessage with a url inline keyboard (expense notification)", async () => {
    server.calls.length = 0;
    const db = {
      chat: { findUnique: vi.fn().mockResolvedValue({ notifyOnExpense: true }) },
    } as unknown as PrismaClient;

    await sendExpenseNotificationMessageHandler(
      { ...expenseInput, force: true },
      db,
      teleBot as never,
      log
    );

    expect(server.calls).toMatchSnapshot();
  });

  it("editMessageText with two url buttons (recurring expense edit)", async () => {
    server.calls.length = 0;

    await editExpenseMessageHandler(
      {
        ...expenseInput,
        messageId: 555,
        recurringTemplateId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      },
      teleBot as never,
      log
    );

    expect(server.calls).toMatchSnapshot();
  });

  it("editMessageText / editMessageCaption / editMessageMedia (broadcast edits)", async () => {
    server.calls.length = 0;
    const delivery = {
      id: "d1",
      userId: RUNNER,
      username: "bubuding0809",
      firstName: "Ruoqian",
      status: "SENT",
      telegramChatId: RUNNER,
      telegramMessageId: 777n,
    };
    const db = {
      broadcastDelivery: {
        findUnique: vi.fn().mockResolvedValue(delivery),
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Db;
    const ctx = { db, teleBot: teleBot as never };

    await editDelivery(ctx, "d1", null, { text: "Plain *edited*" });
    await editDelivery(ctx, "d1", "PHOTO", { text: "Caption *edited*" });
    await editDelivery(ctx, "d1", "PHOTO", {
      text: "Media swapped",
      media: { kind: "photo", buffer: PHOTO, filename: "swap.png" },
    });

    expect(server.calls).toMatchSnapshot();
  });

  it("sendPhoto multipart upload (broadcast with photo)", async () => {
    server.calls.length = 0;
    const tx = {
      broadcast: { create: vi.fn().mockResolvedValue({ id: "b1" }) },
      broadcastDelivery: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([{ id: "d1", userId: RUNNER }]),
      },
    };
    const db = {
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: RUNNER, username: "bubuding0809", firstName: "Ruoqian" },
          ]),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
      broadcast: { update: vi.fn().mockResolvedValue({}) },
      broadcastDelivery: { update: vi.fn().mockResolvedValue({}) },
    } as unknown as Db;

    await createBroadcast(
      { db, teleBot: teleBot as never, log },
      {
        message: "Hello *world*",
        targetUserIds: [Number(RUNNER)],
        media: { kind: "photo", buffer: PHOTO, filename: "hello.png" },
        createdByTelegramId: null,
      }
    );

    expect(server.calls).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Record the snapshots**

Run: `cd packages/trpc && npx vitest run src/testing/telegramWire.spec.ts`
Expected: PASS with "4 snapshots written". Open `src/testing/__snapshots__/telegramWire.spec.ts.snap` and confirm:
- the first test shows a `getMe` call then a `sendMessage` whose body has `chat_id: -1002371842523`, `parse_mode: "MarkdownV2"`, `message_thread_id: 147`, and `reply_markup.inline_keyboard[0][0].text: "View Expense"`;
- the second shows `editMessageText` with `message_id: 555` and two buttons (`View Expense`, `View Schedule`);
- the third shows `editMessageText`, `editMessageCaption`, `editMessageMedia` in that order, the last with `media.media` collapsed to `{ filename: "swap.png", bytes: 34, sha256: "…" }`;
- the fourth shows `sendPhoto` with `photo` collapsed to `{ filename: "hello.png", … }` and `caption` present.

If any body contains a random-looking value (an `attach://` string that survived, a timestamp), fix `parseTelegramBody` or the input, delete the snap file, and re-record. Snapshots must be deterministic across runs: run the spec twice and confirm the second run reports 0 written, 0 obsolete.

- [ ] **Step 3: Commit**

```bash
git add packages/trpc/src/testing/telegramWire.spec.ts packages/trpc/src/testing/__snapshots__/telegramWire.spec.ts.snap
git commit -m "test(telegram): wire-level snapshots of Bot API request bodies

Recorded with telegraf as the client. The grammy swap must leave these
byte-identical.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DVTrDKmmC78vNagw8mAwG4"
```

---

### Task 3: Recording proxy, differ, and PNG helper

**Files:**
- Create: `apps/lambda/scripts/uat/wire.ts`
- Create: `apps/lambda/scripts/uat/recording-proxy.ts`
- Create: `apps/lambda/scripts/uat/diff-recordings.ts`, `apps/lambda/scripts/uat/diff-recordings.test.ts`
- Create: `apps/lambda/scripts/uat/png.ts`, `apps/lambda/scripts/uat/png.test.ts`
- Modify: `apps/lambda/tsconfig.json` (include scripts), `apps/lambda/package.json` (scripts + devDeps), `.gitignore`

**Interfaces:**
- Produces: `startRecordingProxy({ port?, upstream?, logPath }): Promise<{ url: string; close(): Promise<void> }>`, `type RecordedEntry = { seq: number; method: string; request: Record<string, unknown>; response: unknown }`.
- Produces: `normalize(value: unknown): unknown`, `diffRecordings(baseline: RecordedEntry[], candidate: RecordedEntry[]): string[]`, `readJsonl(path: string): RecordedEntry[]`.
- Produces: `makePng(width: number, height: number, rgb: [number, number, number]): Buffer`.

- [ ] **Step 1: Wire tooling into the lambda package**

`apps/lambda/tsconfig.json` → `"include": ["./api/**/*.ts", "./scripts/**/*.ts"],`

`apps/lambda/package.json`:
- add to `scripts`: `"uat:record": "tsx scripts/uat/run-uat.ts",` and `"uat:diff": "tsx scripts/uat/diff-recordings.ts"`
- add to `devDependencies`: `"@trpc/client": "^11.0.0",` and `"superjson": "^2.2.2",`

Root `.gitignore`: append

```
# Local UAT recordings (Telegram traffic captured by apps/lambda/scripts/uat)
apps/lambda/.uat/
```

Run: `pnpm install`
Expected: lockfile updates, `@trpc/client` resolves to the same 11.x as `@trpc/server`.

- [ ] **Step 2: Copy the body parser**

Create `apps/lambda/scripts/uat/wire.ts` with exactly the `FileSummary` type, `parseScalar`, `resolveAttachRefs`, and `parseTelegramBody` from `packages/trpc/src/testing/fakeTelegramServer.ts` (Task 1, Step 1). Do not include the server or responder. Add a header comment: `// Copy of packages/trpc/src/testing/fakeTelegramServer.ts parseTelegramBody. Kept in sync by hand; lambda consumes @dko/trpc via dist so test helpers are not importable.`

- [ ] **Step 3: Write the failing differ test**

Create `apps/lambda/scripts/uat/diff-recordings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diffRecordings, normalize, type RecordedEntry } from "./diff-recordings.js";

const entry = (
  seq: number,
  method: string,
  request: Record<string, unknown>,
  response: unknown
): RecordedEntry => ({ seq, method, request, response });

describe("normalize", () => {
  it("drops volatile keys, masks ids in deep links, and sorts keys", () => {
    const value = {
      text: "x",
      chat_id: 5,
      message_id: 9,
      reply_markup: {
        inline_keyboard: [
          [{ url: "https://t.me/bot?startapp=v1_g_abc_e_XyZ", text: "View" }],
          [{ callback_data: "s:123e4567-e89b-12d3-a456-426614174000:cat", text: "Cat" }],
        ],
      },
    };
    expect(JSON.stringify(normalize(value))).toBe(
      JSON.stringify({
        chat_id: 5,
        reply_markup: {
          inline_keyboard: [
            [{ text: "View", url: "https://t.me/bot?startapp=<payload>" }],
            [{ callback_data: "s:<uuid>:cat", text: "Cat" }],
          ],
        },
        text: "x",
      })
    );
  });
});

describe("diffRecordings", () => {
  it("returns no problems when entries differ only in volatile fields", () => {
    const a = [
      entry(1, "sendMessage", { chat_id: 1, text: "hi", parse_mode: "MarkdownV2" }, {
        ok: true,
        result: { message_id: 10, date: 1, text: "hi", entities: [] },
      }),
    ];
    const b = [
      entry(1, "sendMessage", { parse_mode: "MarkdownV2", text: "hi", chat_id: 1 }, {
        ok: true,
        result: { message_id: 11, date: 2, text: "hi", entities: [] },
      }),
    ];
    expect(diffRecordings(a, b)).toEqual([]);
  });

  it("reports request and response differences and length mismatches", () => {
    const a = [
      entry(1, "sendMessage", { chat_id: 1, text: "hi" }, { result: { text: "hi" } }),
      entry(2, "deleteMessage", { chat_id: 1 }, { result: true }),
    ];
    const b = [entry(1, "sendMessage", { chat_id: 1, text: "bye" }, { result: { text: "bye" } })];
    const problems = diffRecordings(a, b);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("request differs");
    expect(problems[1]).toContain("response differs");
    expect(problems[2]).toContain("missing in candidate");
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd apps/lambda && pnpm exec vitest run scripts/uat/diff-recordings.test.ts`
Expected: FAIL, module `./diff-recordings.js` not found.

- [ ] **Step 5: Write the differ**

Create `apps/lambda/scripts/uat/diff-recordings.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type RecordedEntry = {
  seq: number;
  method: string;
  request: Record<string, unknown>;
  response: unknown;
};

// Keys whose values legitimately change between two identical runs.
const IGNORED_KEYS = new Set([
  "message_id",
  "reply_to_message_id",
  "date",
  "edit_date",
  "file_id",
  "file_unique_id",
  "file_path",
  "file_size",
  "total_count",
  "pinned_message",
]);

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const STARTAPP_RE = /startapp=[A-Za-z0-9_-]+/g;

/** Strip volatile keys, mask per-run identifiers inside strings, sort keys. */
export function normalize(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(UUID_RE, "<uuid>").replace(STARTAPP_RE, "startapp=<payload>");
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (IGNORED_KEYS.has(key)) continue;
      out[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function diffRecordings(
  baseline: RecordedEntry[],
  candidate: RecordedEntry[]
): string[] {
  const problems: string[] = [];
  const count = Math.max(baseline.length, candidate.length);
  for (let i = 0; i < count; i++) {
    const a = baseline[i];
    const b = candidate[i];
    if (!a || !b) {
      const present = (a ?? b)!;
      problems.push(
        `#${i + 1} ${present.method}: ${a ? "missing in candidate" : "extra in candidate"}`
      );
      continue;
    }
    if (a.method !== b.method) {
      problems.push(`#${i + 1}: method ${a.method} -> ${b.method}`);
      continue;
    }
    const reqA = JSON.stringify(normalize(a.request));
    const reqB = JSON.stringify(normalize(b.request));
    if (reqA !== reqB) {
      problems.push(
        `#${i + 1} ${a.method}: request differs\n  baseline:  ${reqA}\n  candidate: ${reqB}`
      );
    }
    const resA = JSON.stringify(normalize(a.response));
    const resB = JSON.stringify(normalize(b.response));
    if (resA !== resB) {
      problems.push(
        `#${i + 1} ${a.method}: response differs\n  baseline:  ${resA}\n  candidate: ${resB}`
      );
    }
  }
  return problems;
}

export function readJsonl(path: string): RecordedEntry[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RecordedEntry);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [baselinePath, candidatePath] = process.argv.slice(2);
  if (!baselinePath || !candidatePath) {
    console.error("usage: tsx scripts/uat/diff-recordings.ts <baseline.jsonl> <candidate.jsonl>");
    process.exit(2);
  }
  const baseline = readJsonl(baselinePath);
  const problems = diffRecordings(baseline, readJsonl(candidatePath));
  if (problems.length === 0) {
    console.log(`no differences across ${baseline.length} recorded calls`);
    process.exit(0);
  }
  for (const p of problems) console.error(p);
  console.error(`${problems.length} difference(s)`);
  process.exit(1);
}
```

- [ ] **Step 6: Run the differ test to verify it passes**

Run: `cd apps/lambda && pnpm exec vitest run scripts/uat/diff-recordings.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Write the failing PNG test**

Create `apps/lambda/scripts/uat/png.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { makePng } from "./png.js";

describe("makePng", () => {
  it("emits a PNG with the requested dimensions and is deterministic", () => {
    const a = makePng(128, 64, [255, 204, 0]);
    const b = makePng(128, 64, [255, 204, 0]);
    expect(a.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(a.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(a.readUInt32BE(16)).toBe(128);
    expect(a.readUInt32BE(20)).toBe(64);
    expect(a.subarray(a.length - 12, a.length - 8).toString("ascii")).toBe("IEND");
    expect(createHash("sha256").update(a).digest("hex")).toBe(
      createHash("sha256").update(b).digest("hex")
    );
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd apps/lambda && pnpm exec vitest run scripts/uat/png.test.ts`
Expected: FAIL, module `./png.js` not found.

- [ ] **Step 9: Write the PNG generator**

Create `apps/lambda/scripts/uat/png.ts`:

```ts
import { deflateSync } from "node:zlib";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** Solid-colour 8-bit RGB PNG. Deterministic bytes for a given input. */
export function makePng(
  width: number,
  height: number,
  [r, g, b]: [number, number, number]
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const row = Buffer.alloc(1 + width * 3); // leading filter byte 0
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
```

- [ ] **Step 10: Run the PNG test to verify it passes**

Run: `cd apps/lambda && pnpm exec vitest run scripts/uat/png.test.ts`
Expected: PASS.

- [ ] **Step 11: Write the recording proxy**

Create `apps/lambda/scripts/uat/recording-proxy.ts`:

```ts
import { createServer } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseTelegramBody } from "./wire.js";

export type RecordedEntry = {
  seq: number;
  method: string;
  request: Record<string, unknown>;
  response: unknown;
};

function safeJson(buf: Buffer): unknown {
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return { raw: buf.toString("utf8").slice(0, 500) };
  }
}

/**
 * Forwards every request to the real Bot API and appends one JSONL line per
 * call. File downloads (/file/bot<token>/...) are logged as method "file"
 * with only the byte count and sha256 of the response; the token never
 * reaches the log.
 */
export async function startRecordingProxy(opts: {
  port?: number;
  upstream?: string;
  logPath: string;
}): Promise<{ url: string; close(): Promise<void> }> {
  const upstream = (opts.upstream ?? "https://api.telegram.org").replace(/\/$/, "");
  mkdirSync(dirname(opts.logPath), { recursive: true });
  let seq = 0;

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    const url = req.url ?? "/";
    const isFile = url.startsWith("/file/");
    const method = isFile ? "file" : (url.split("?")[0]!.split("/").pop() ?? "");
    const contentType = req.headers["content-type"] ?? "";

    const upstreamRes = await fetch(upstream + url, {
      method: req.method,
      headers: contentType ? { "content-type": contentType } : undefined,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : raw,
    });
    const resBuf = Buffer.from(await upstreamRes.arrayBuffer());

    const entry: RecordedEntry = {
      seq: ++seq,
      method,
      request: isFile ? {} : await parseTelegramBody(contentType, raw),
      response: isFile
        ? {
            status: upstreamRes.status,
            bytes: resBuf.length,
            sha256: createHash("sha256").update(resBuf).digest("hex"),
          }
        : safeJson(resBuf),
    };
    appendFileSync(opts.logPath, JSON.stringify(entry) + "\n");

    res.statusCode = upstreamRes.status;
    const ct = upstreamRes.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    res.end(resBuf);
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 8082, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("proxy did not bind a port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const logIdx = process.argv.indexOf("--log");
  const logPath = logIdx >= 0 ? process.argv[logIdx + 1] : undefined;
  if (!logPath) {
    console.error("usage: tsx scripts/uat/recording-proxy.ts --log <file.jsonl> [--port 8082]");
    process.exit(2);
  }
  const portIdx = process.argv.indexOf("--port");
  const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : 8082;
  startRecordingProxy({ port, logPath }).then((proxy) => {
    console.log(`recording proxy on ${proxy.url} -> https://api.telegram.org, log ${logPath}`);
  });
}
```

- [ ] **Step 12: Type-check and run the lambda test suite**

Run: `cd apps/lambda && pnpm check-types && pnpm test`
Expected: both pass. `check-types` now covers `scripts/**`.

- [ ] **Step 13: Commit**

```bash
git add apps/lambda/scripts/uat/wire.ts apps/lambda/scripts/uat/recording-proxy.ts apps/lambda/scripts/uat/diff-recordings.ts apps/lambda/scripts/uat/diff-recordings.test.ts apps/lambda/scripts/uat/png.ts apps/lambda/scripts/uat/png.test.ts apps/lambda/tsconfig.json apps/lambda/package.json pnpm-lock.yaml .gitignore
git commit -m "feat(uat): Telegram recording proxy and recording differ

Local forwarding proxy that appends every Bot API call and response as
JSONL, a normalizing differ that ignores per-run ids, and a deterministic
PNG generator for upload steps.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DVTrDKmmC78vNagw8mAwG4"
```

---

### Task 4: UAT runner and baseline recording

**Files:**
- Create: `apps/lambda/scripts/uat/run-uat.ts`
- Modify: `AGENTS.md` (dev section, add a short "Telegram UAT recording" note)

**Interfaces:**
- Consumes: `startRecordingProxy`, `makePng` from Task 3; `AppRouter` type from `@dko/trpc`; `sign` from `@telegram-apps/init-data-node`; `PrismaClient`, `SplitMode` from `@dko/database`.
- Produces: `apps/lambda/.uat/<label>.jsonl` and `apps/lambda/.uat/<label>.summary.json`.

- [ ] **Step 1: Write the runner**

Create `apps/lambda/scripts/uat/run-uat.ts`:

```ts
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
const outDir = resolve(lambdaRoot, ".uat");
const logPath = resolve(outDir, `${label}.jsonl`);
const summaryPath = resolve(outDir, `${label}.summary.json`);
const base = "http://localhost:8081";

const token = process.env.TELEGRAM_BOT_TOKEN;
const apiKey = process.env.API_KEY;
if (!token || !apiKey) {
  console.error("TELEGRAM_BOT_TOKEN and API_KEY must be set (apps/lambda/env/.env.development)");
  process.exit(2);
}

type StepResult = { step: string; ok: boolean; ms: number; note?: string };
const summary: StepResult[] = [];

async function step<T>(name: string, fn: () => Promise<T>, note?: (r: T) => string): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    summary.push({ step: name, ok: true, ms: Date.now() - started, note: note?.(result) });
    console.log(`ok   ${name}${note ? `  ${note(result)}` : ""}`);
    return result;
  } catch (err) {
    summary.push({ step: name, ok: false, ms: Date.now() - started, note: String(err) });
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

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  try {
    await fetch(`${base}/`);
    console.error(`something already answers on ${base}; stop your dev server first`);
    process.exit(2);
  } catch {
    // port free
  }

  // Lambda resolves @dko/trpc from dist, so rebuild first or the run tests stale code.
  execSync("pnpm --filter @dko/trpc build", { cwd: repoRoot, stdio: "inherit" });

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

    const runner = await prisma.user.findUniqueOrThrow({ where: { id: BigInt(runnerId) } });
    const initData = sign(
      {
        user: {
          id: runnerId,
          first_name: runner.firstName,
          username: runner.username ?? undefined,
        },
      },
      token,
      new Date()
    );
    const authHeaders = { "x-api-key": apiKey, Authorization: `tma ${initData}` };
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
      () => client.telegram.sendGroupReminderMessage.mutate({ chatId: String(chatId) }),
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
      client.snapshot.renderSnapshotView.query({ snapshotId: snapshot.id, view: "cat", userId: runnerId })
    );
    await step("snapshot.renderSnapshotView(date)", () =>
      client.snapshot.renderSnapshotView.query({ snapshotId: snapshot.id, view: "date", userId: runnerId })
    );

    await step("snapshot.delete", () => client.snapshot.delete.mutate({ snapshotId: snapshot.id }));
    snapshotId = undefined;

    await step("expense.deleteExpense", () => client.expense.deleteExpense.mutate({ expenseId: expense.id }));
    expenseId = undefined;

    const broadcast = await step(
      "POST /api/admin/broadcast (photo)",
      async () => {
        const form = new FormData();
        form.set("message", "UAT broadcast *hello*");
        form.set("targetUserIds", JSON.stringify([runnerId]));
        form.set("file", new Blob([makePng(128, 128, [255, 204, 0])], { type: "image/png" }), "uat.png");
        const res = await fetch(`${base}/api/admin/broadcast`, {
          method: "POST",
          headers: { "x-api-key": apiKey },
          body: form,
        });
        if (!res.ok) throw new Error(`broadcast ${res.status}: ${await res.text()}`);
        return (await res.json()) as { broadcastId: string; successCount: number };
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
          const res = await fetch(`${base}${path}`, { headers: { Authorization: `tma ${initData}` } });
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
    try {
      if (snapshotId) await prisma.snapshot.delete({ where: { id: snapshotId } });
      if (expenseId) await prisma.expense.delete({ where: { id: expenseId } });
      if (broadcastId) {
        await prisma.broadcastDelivery.deleteMany({ where: { broadcastId } });
        await prisma.broadcast.delete({ where: { id: broadcastId } });
      }
    } catch (err) {
      console.error("cleanup failed", err);
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
```

- [ ] **Step 2: Type-check**

Run: `cd apps/lambda && pnpm check-types`
Expected: PASS. If `client.snapshot.create` or `client.admin.broadcastEdit` are reported missing, the router key differs; check `packages/trpc/src/root.ts` and `packages/trpc/src/routers/snapshot/index.ts` / `routers/admin/index.ts` and fix the call, not the router.

- [ ] **Step 3: Confirm DB is migrated, then record the baseline**

Run:
```bash
cd packages/database && pnpm exec prisma migrate status
cd ../.. && pnpm --filter lambda uat:record --label baseline
```
Expected: `migrate status` reports "Database schema is up to date!". The runner prints `ok` for all 14 steps and writes `apps/lambda/.uat/baseline.jsonl`. `wc -l apps/lambda/.uat/baseline.jsonl` is roughly 20 to 30 lines (getMe calls, sends, edits, deletes, getChat, getFile, file downloads).

Check in Telegram: DEV-BOX-2 shows the expense notification (edited), the `/summary` message with the View Debts button, the snapshot message with view buttons; the runner's DM shows the broadcast photo with the swapped image and edited caption.

If a step fails with a Telegram 4xx, that is a pre-existing issue or a bad input in the runner, not a swap regression. Fix the runner input and re-run before proceeding. Do not proceed to Task 5 without a clean baseline.

- [ ] **Step 4: Document the workflow**

In `AGENTS.md`, in the local development section near the `@BananaSplitzStgBot` note (around line 498), add:

```markdown
### Telegram wire UAT

`pnpm --filter lambda uat:record --label <name>` starts a recording proxy on `:8082`, boots the lambda dev server with `TELEGRAM_API_ROOT` pointed at it, drives the real tRPC/REST endpoints against DEV-BOX-2 on the staging bot, and writes `apps/lambda/.uat/<name>.jsonl` (every Bot API request and response). `pnpm --filter lambda uat:diff a.jsonl b.jsonl` compares two recordings ignoring per-run ids. Use it whenever a change touches how bot messages are built or sent: record on `main`, record on the branch, diff. Requires a migrated local DB and port 8081 free.
```

- [ ] **Step 5: Commit**

```bash
git add apps/lambda/scripts/uat/run-uat.ts AGENTS.md
git commit -m "feat(uat): drive the dev server over HTTP and record Telegram traffic

Runs the real tRPC and REST endpoints against the staging bot through the
recording proxy: expense create/update/delete, group reminder, snapshot
share and views, broadcast photo with caption and media edits, avatar and
chat photo. Cleans up its own DB rows.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DVTrDKmmC78vNagw8mAwG4"
```

Keep `apps/lambda/.uat/baseline.jsonl` on disk. It is gitignored and Task 8 needs it.

---

### Task 5: `packages/trpc` moves to grammy

**Files:**
- Modify: `packages/trpc/package.json`
- Modify: `packages/trpc/src/trpc.ts:5,24,63-92`
- Modify: `packages/trpc/src/utils/telegram.ts` (add `inlineKeyboard`)
- Create: `packages/trpc/src/utils/telegram.inlineKeyboard.spec.ts`
- Modify (import swap only): `packages/trpc/src/routers/telegram/{getChat,sendDebtReminderMessage,deleteExpenseNotificationMessage,getChatMember,sendCurrencyConversionNotificationMessage,sendMessage,sendTransferNotificationMessage,sendSettlementNotificationMessage}.ts`, `routers/settlement/{createSettlement,deleteSettlement,settleAllDebts}.ts`, `routers/expense/{deleteExpense,updateExpensesBulk,sendBatchExpenseSummary,createExpensesBulk,updateExpense,createExpense,convertCurrencyBulk}.ts`, `routers/snapshot/shareSnapshotMessage.ts`, `routers/expense/sendBatchExpenseSummary.spec.ts`
- Modify (import swap + keyboard import): `routers/telegram/{sendExpenseNotificationMessage,sendGroupReminderMessage,editExpenseNotificationMessage}.ts`
- Modify (signature deltas): `routers/telegram/editExpenseNotificationMessage.ts:135-143`, `services/broadcast.ts:2,49,101-121`, `services/broadcastActions.ts:1,19,74,127-150,184`
- Modify: `routers/telegram/editExpenseNotificationMessage.spec.ts:140,164,182`
- Modify: `packages/trpc/src/testing/telegramWire.spec.ts` (client construction line only)

**Interfaces:**
- Consumes: grammy `Api`, `InputFile` from `"grammy"`.
- Produces: `inlineKeyboard(buttons: InlineButton[]): { reply_markup: { inline_keyboard: InlineButton[][] } }` in `utils/telegram.ts`.

- [ ] **Step 1: Swap dependencies**

In `packages/trpc/package.json`: remove `"@types/node-telegram-bot-api"` from devDependencies; remove `"node-telegram-bot-api"` and `"telegraf"` from dependencies; add `"grammy": "^1.46.0"` to dependencies.

Run: `pnpm install`
Expected: lockfile updates; `node -p "require('./packages/trpc/node_modules/grammy/package.json').version"` prints `1.46.x`.

- [ ] **Step 2: Write the failing `inlineKeyboard` test**

Create `packages/trpc/src/utils/telegram.inlineKeyboard.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { inlineKeyboard } from "./telegram.js";

describe("inlineKeyboard", () => {
  it("wraps the buttons in a single row under reply_markup", () => {
    const buttons = [
      { text: "View Expense", url: "https://t.me/bot?startapp=x" },
      { text: "View Schedule", url: "https://t.me/bot?startapp=y" },
    ];
    expect(inlineKeyboard(buttons)).toEqual({
      reply_markup: { inline_keyboard: [buttons] },
    });
  });
});
```

Run: `cd packages/trpc && npx vitest run src/utils/telegram.inlineKeyboard.spec.ts`
Expected: FAIL, `inlineKeyboard` is not exported.

- [ ] **Step 3: Add the helper**

Append to `packages/trpc/src/utils/telegram.ts`:

```ts
export type InlineButton =
  | { text: string; url: string }
  | { text: string; callback_data: string };

/**
 * One-row inline keyboard, spread into a send/edit call's options:
 *   teleBot.sendMessage(chatId, text, { parse_mode: "MarkdownV2", ...inlineKeyboard(buttons) })
 * Same output shape as telegraf's `inlineKeyboard(buttons)` with a flat
 * button array, which is what every call site used.
 */
export function inlineKeyboard(buttons: InlineButton[]): {
  reply_markup: { inline_keyboard: InlineButton[][] };
} {
  return { reply_markup: { inline_keyboard: [buttons] } };
}
```

Run the spec again. Expected: PASS.

- [ ] **Step 4: Swap the context client**

In `packages/trpc/src/trpc.ts`:
- line 5: `import { Telegram } from "telegraf";` → `import { Api } from "grammy";`
- line 24: delete `import "telegraf/types"; // Required to ensure types are portable`
- in `createTRPCContext`: `teleBot: new Telegram(botToken, apiRoot ? { apiRoot } : undefined),` → `teleBot: new Api(botToken, apiRoot ? { apiRoot } : undefined),`

- [ ] **Step 5: Swap the type import in the 24 plain files**

In each file listed under "Modify (import swap only)" and the three under "import swap + keyboard import", replace the telegraf import:

- `import { Telegram } from "telegraf";` → `import type { Api } from "grammy";`
- `import type { Telegram } from "telegraf";` → `import type { Api } from "grammy";`

and every `teleBot: Telegram` (or `Telegram` used as a type, including `as unknown as Telegram` in `sendBatchExpenseSummary.spec.ts:232`) → `Api`.

In the three keyboard files replace `import { inlineKeyboard } from "telegraf/markup";` with `import { inlineKeyboard } from "../../utils/telegram.js";` (these files already import other names from that module; merge into the existing import line).

Fast way to find every remaining reference: `rg -n "telegraf" packages/trpc/src` must return nothing when done.

- [ ] **Step 6: Apply the four signature deltas**

`packages/trpc/src/routers/telegram/editExpenseNotificationMessage.ts:135-143`:

```ts
    await teleBot.editMessageText(input.chatId, input.messageId, message, {
      parse_mode: "MarkdownV2",
      ...keyboard,
    });
```

`packages/trpc/src/services/broadcast.ts`: change line 2 to `import { InputFile, type Api } from "grammy";`, line 49 `teleBot: Api;`, and lines 101-104:

```ts
        const source =
          cachedFileId ??
          new InputFile(opts.media.buffer, opts.media.filename);
```

`packages/trpc/src/services/broadcastActions.ts`: line 1 → `import { InputFile, type Api } from "grammy";`; every `teleBot: Telegram` → `teleBot: Api` (lines 19, 74, 184); lines 126-150:

```ts
    if (decision.method === "editMessageText") {
      await ctx.teleBot.editMessageText(chatId, msgId, caption ?? "", {
        parse_mode: "MarkdownV2",
      });
    } else if (decision.method === "editMessageCaption") {
      await ctx.teleBot.editMessageCaption(chatId, msgId, {
        caption,
        parse_mode: "MarkdownV2",
      });
    } else {
      const m = input.media!;
      const sent = await ctx.teleBot.editMessageMedia(chatId, msgId, {
        type: m.kind,
        media: new InputFile(m.buffer, m.filename),
        caption,
        parse_mode: "MarkdownV2",
      });
```

The `if (typeof sent !== "boolean")` block below stays as is.

- [ ] **Step 7: Fix the positional expectations in the edit spec**

In `packages/trpc/src/routers/telegram/editExpenseNotificationMessage.spec.ts`, lines 140, 164, 182: `const [, , , , extra] = mockTeleBot.editMessageText.mock.calls[0] ?? [];` → `const [, , , extra] = mockTeleBot.editMessageText.mock.calls[0] ?? [];`

- [ ] **Step 8: Point the wire spec at grammy**

In `packages/trpc/src/testing/telegramWire.spec.ts`: `import { Telegram } from "telegraf";` → `import { Api } from "grammy";`, `let teleBot: Telegram;` → `let teleBot: Api;`, `teleBot = new Telegram("123:TEST", { apiRoot: server.url });` → `teleBot = new Api("123:TEST", { apiRoot: server.url });`. Also change `import type { Api }` in `trpc.apiRoot.spec.ts` if the editor added one; that spec has no telegraf import and needs no change.

- [ ] **Step 9: Verify: types, all specs, snapshots unchanged**

Run: `cd packages/trpc && pnpm check-types && npx vitest run`
Expected: `check-types` passes with zero errors. All specs pass. The vitest summary shows **0 snapshots written, 0 obsolete, 0 mismatched** for `telegramWire.spec.ts`. `git status` shows `__snapshots__/telegramWire.spec.ts.snap` unmodified.

If a snapshot mismatches, read the diff: a key-order-only difference means the snapshot serializer already sorts keys and the values differ, so it is a real regression in how grammy serialized that call. Fix the call site, never the snapshot.

- [ ] **Step 10: Commit**

```bash
git add packages/trpc pnpm-lock.yaml
git commit -m "refactor(trpc): replace telegraf with grammy Api client

ctx.teleBot is now a grammy Api. Edit methods drop telegraf's
inline_message_id slot, editMessageCaption takes caption in options,
uploads use InputFile, and inlineKeyboard is a local helper with the
same output shape. Wire snapshots unchanged. Drops the unused
node-telegram-bot-api dependency.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DVTrDKmmC78vNagw8mAwG4"
```

---

### Task 6: `apps/lambda` moves to grammy

**Files:**
- Modify: `apps/lambda/package.json`
- Modify: `apps/lambda/api/_telegram.ts`
- Create: `apps/lambda/api/_telegramFile.ts`, `apps/lambda/api/_telegramFile.test.ts`
- Modify: `apps/lambda/api/avatar.ts:127-134`, `apps/lambda/api/chat-photo.ts:101-102`
- Modify: `apps/lambda/api/_avatar.test.ts:33-38`, `apps/lambda/api/_chat-photo.test.ts:34-39`
- Modify: `apps/lambda/api/_redact.ts:9-10` (comment)

**Interfaces:**
- Produces: `telegramFileUrl(apiRoot: string | undefined, token: string, filePath: string): string`, `fetchTelegramFile(teleBot: Api, fileId: string): Promise<Response>`.

- [ ] **Step 1: Swap dependencies**

In `apps/lambda/package.json` dependencies: remove `"telegraf"`, add `"grammy": "^1.46.0"`. Run `pnpm install`.

- [ ] **Step 2: Write the failing file-URL test**

Create `apps/lambda/api/_telegramFile.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { telegramFileUrl, fetchTelegramFile } from "./_telegramFile.js";

describe("telegramFileUrl", () => {
  it("builds the download URL against the default root", () => {
    expect(telegramFileUrl(undefined, "123:TOKEN", "photos/file_1.jpg")).toBe(
      "https://api.telegram.org/file/bot123:TOKEN/photos/file_1.jpg"
    );
  });
  it("honours a custom root and strips a trailing slash", () => {
    expect(telegramFileUrl("http://127.0.0.1:8082/", "123:TOKEN", "a/b.jpg")).toBe(
      "http://127.0.0.1:8082/file/bot123:TOKEN/a/b.jpg"
    );
  });
});

describe("fetchTelegramFile", () => {
  it("throws when Telegram returns no file_path", async () => {
    const teleBot = { getFile: vi.fn().mockResolvedValue({ file_id: "x" }) };
    await expect(fetchTelegramFile(teleBot as never, "x")).rejects.toThrow(
      "file_path"
    );
  });
});
```

Run: `cd apps/lambda && pnpm exec vitest run api/_telegramFile.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the factory and file helper**

Replace `apps/lambda/api/_telegram.ts`:

```ts
import { Api } from "grammy";
import { env } from "./env.js";

/**
 * Single place the lambda constructs its Telegram client. Honours
 * TELEGRAM_API_ROOT so the local UAT recording proxy can sit in front of
 * api.telegram.org.
 */
export function createTelegramClient(): Api {
  return new Api(
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_API_ROOT ? { apiRoot: env.TELEGRAM_API_ROOT } : undefined
  );
}
```

Create `apps/lambda/api/_telegramFile.ts`:

```ts
import type { Api } from "grammy";
import { env } from "./env.js";

/** grammy has no getFileLink; build the download URL the way telegraf did. */
export function telegramFileUrl(
  apiRoot: string | undefined,
  token: string,
  filePath: string
): string {
  const root = (apiRoot ?? "https://api.telegram.org").replace(/\/$/, "");
  return `${root}/file/bot${token}/${filePath}`;
}

/**
 * Resolve a file_id to bytes. Throws when Telegram returns no file_path,
 * matching telegraf's getFileLink behaviour so callers' existing catch
 * blocks keep producing a 502.
 */
export async function fetchTelegramFile(
  teleBot: Api,
  fileId: string
): Promise<Response> {
  const file = await teleBot.getFile(fileId);
  if (!file.file_path) {
    throw new Error(`Telegram returned no file_path for file ${fileId}`);
  }
  return fetch(
    telegramFileUrl(env.TELEGRAM_API_ROOT, env.TELEGRAM_BOT_TOKEN, file.file_path)
  );
}
```

Run the test again. Expected: PASS (3 tests). If `env.js` fails to load in the test because required vars are missing, add at the top of the test file the same `vi.mock("./env.js", …)` block the existing `_avatar.test.ts` uses.

- [ ] **Step 4: Update the two handlers**

`apps/lambda/api/avatar.ts`: add `import { fetchTelegramFile } from "./_telegramFile.js";`. Replace lines 127-134:

```ts
    const photos = await teleBot.getUserProfilePhotos(Number(targetId), {
      offset: 0,
      limit: 1,
    });
    const biggest = photos.photos[0]?.at(-1);
    if (!biggest) {
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      return res.status(404).end();
    }
    const upstream = await fetchTelegramFile(teleBot, biggest.file_id);
```

Also update the comment two lines above (`// ... Telegraf's signature requires number, not bigint.`) to say `grammy's`.

`apps/lambda/api/chat-photo.ts`: add the same import. Replace lines 101-102:

```ts
    const upstream = await fetchTelegramFile(teleBot, bigFileId);
```

Update its `Telegraf's signature` comment the same way.

`apps/lambda/api/_redact.ts:9-10`: change `Mirrors telegraf's internal redactToken pattern for the one HTTP call (fetch of the file bytes) that doesn't pass through telegraf.` to `Covers the one HTTP call (fetch of the file bytes) that goes through Node fetch rather than the grammy client.`

- [ ] **Step 5: Re-point the two test mocks**

`apps/lambda/api/_avatar.test.ts:33-38` → 

```ts
vi.mock("grammy", () => ({
  Api: vi.fn(function (this: Record<string, unknown>) {
    this.getUserProfilePhotos = getUserProfilePhotosMock;
    this.getFile = getFileMock;
  }),
}));
```

and rename the hoisted `getFileLinkMock` to `getFileMock` (line 5 destructure and line 17 definition). Wherever a test did `getFileLinkMock.mockResolvedValue(new URL("https://api.telegram.org/file/bot…/photos/x.jpg"))`, it becomes `getFileMock.mockResolvedValue({ file_id: "f", file_unique_id: "u", file_path: "photos/x.jpg" })`. Wherever a test asserts the URL passed to the mocked global `fetch`, the expected string is `https://api.telegram.org/file/bot<the token the test's env mock provides>/photos/x.jpg`. Wherever a test asserts `getUserProfilePhotosMock` was called with `(id, 0, 1)`, it is now `(id, { offset: 0, limit: 1 })`. The "returns 502 when telegraf throws" test: rename to "returns 502 when the Telegram client throws"; behaviour unchanged.

`apps/lambda/api/_chat-photo.test.ts:34-39` → same shape with `this.getChat = getChatMock; this.getFile = getFileMock;`, same mock and assertion updates.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @dko/trpc build && cd apps/lambda && pnpm check-types && pnpm test && rg -n "telegraf" .`
Expected: types pass, all tests pass, `rg` prints nothing (no telegraf references remain in `apps/lambda`).

- [ ] **Step 7: Commit**

```bash
git add apps/lambda pnpm-lock.yaml
git commit -m "refactor(lambda): replace telegraf with grammy Api client

getFileLink has no grammy equivalent; getFile plus a URL builder that
honours TELEGRAM_API_ROOT replaces it. getUserProfilePhotos takes an
options object.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DVTrDKmmC78vNagw8mAwG4"
```

---

### Task 7: Bump `apps/bot` and verify the whole workspace

**Files:**
- Modify: `apps/bot/package.json:31`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Bump**

`apps/bot/package.json`: `"grammy": "^1.41.1"` → `"grammy": "^1.46.0"`. Run `pnpm install`.

- [ ] **Step 2: Confirm one grammy version workspace-wide**

Run: `pnpm ls -r grammy --depth 0 | rg grammy`
Expected: `apps/bot`, `apps/lambda`, `packages/trpc` all show the same `1.46.x`. No `telegraf` or `node-telegram-bot-api` anywhere: `pnpm ls -r telegraf node-telegram-bot-api --depth 0` prints no matches.

- [ ] **Step 3: Full workspace verification**

Run from repo root: `pnpm check-types && pnpm test && pnpm build`
Expected: all three succeed for every package. If `apps/bot` type errors surface from the bump, they come from narrowed grammy types (e.g. `ctx.subscription`); fix the usage in `apps/bot/src`, do not pin the version back.

- [ ] **Step 4: Commit**

```bash
git add apps/bot/package.json pnpm-lock.yaml
git commit -m "chore(bot): bump grammy to 1.46.0 for Bot API 10.3

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DVTrDKmmC78vNagw8mAwG4"
```

---

### Task 8: Branch recording, diff, and PR

**Files:** none new. Uses `apps/lambda/.uat/baseline.jsonl` from Task 4.

- [ ] **Step 1: Record on the branch**

Run: `pnpm --filter lambda uat:record --label grammy`
Expected: all 14 steps `ok`. Same message set appears in DEV-BOX-2 and the runner's DM, directly below the baseline batch.

- [ ] **Step 2: Diff**

Run: `pnpm --filter lambda uat:diff apps/lambda/.uat/baseline.jsonl apps/lambda/.uat/grammy.jsonl`
Expected: `no differences across N recorded calls`.

If differences print: a `request differs` line is a serialization regression in the swap; fix the call site in `packages/trpc` or `apps/lambda`, rebuild, re-record with a new label, re-diff. A `response differs` line with identical requests is Telegram-side variance; check whether the differing key belongs in `IGNORED_KEYS` (only if it is genuinely per-run, like an id or timestamp) and never widen the ignore list to hide a text or entity change.

- [ ] **Step 3: One scroll in Telegram**

Ask the user to open DEV-BOX-2 and compare the two adjacent batches: same text, same buttons, buttons open the TMA. Then the DM: two broadcast photos, both with edited caption and swapped image. Use one AskUserQuestion with a single yes/no.

- [ ] **Step 4: Push and open the PR**

Run: `git push -u origin feat/grammy-consolidation`

Use the `pr-description` skill for the body. Title: `refactor: consolidate Telegram clients on grammy 1.46`. Body must link the spec and deck Blob URLs at the top as a quote block, list the four signature deltas, and state the verification evidence: wire snapshots unchanged, `uat:diff` empty across N calls, workspace `check-types`/`test`/`build` green. Note the one optional env var and that no deployed environment sets it. End with the attribution block.

```bash
gh pr create --title "refactor: consolidate Telegram clients on grammy 1.46" --body-file /path/to/body.md
```

Then comment on the PR with a merge-readiness verdict that mentions `@claude`. Do **not** run `gh pr merge --auto`. The user decides after their own look.

- [ ] **Step 5: Save to Marrow**

Write a `decision` memory (area `infra`, topic `telegram-client-consolidation-shipped`) with the PR number, the diff result, and any call-site surprises found during Task 5 or 6.

---

## Self-review

**Spec coverage**
- Dependencies: Tasks 5, 6, 7. ✔
- trpc context swap and 26 import sites: Task 5. ✔
- Four signature deltas + `inlineKeyboard` helper: Task 5 Step 3, 6. ✔ Plus the `getUserProfilePhotos` options-object delta the spec missed: Task 6 Step 4.
- Lambda `getFileLink` replacement with `TELEGRAM_API_ROOT`-aware URL and redact comment: Task 6. ✔
- Two `vi.mock` re-points: Task 6 Step 5. ✔
- Error handling: no change needed; `GrammyError.message` contains the Telegram description, verified in the spec. No task. ✔
- `TELEGRAM_API_ROOT` env var in trpc and lambda: Task 1. ✔
- Recording proxy, JSONL shape, multipart handling, token stripping: Task 3 Step 11. ✔
- UAT over HTTP via `@trpc/client`, admin broadcast multipart, avatar/chat-photo: Task 4. ✔
- Baseline diff with ignore list: Task 3 Steps 5, Task 8. ✔
- Permanent CI guard as wire snapshots: Task 2, checked unchanged in Task 5 Step 9. ✔
- Cleanup and authorization notes: Task 4 runner `finally` block; authorization recorded in the spec. ✔
- Rollout as single PR, no auto-merge before user OK: Task 8. ✔

**Placeholder scan:** no TBD/TODO. Every code step has full code. Task 6 Step 5 describes test edits in terms of the exact old and new mock values because the test bodies were not read in full; the shapes given are complete.

**Type consistency:** `RecordedCall` (fake server) vs `RecordedEntry` (proxy/differ) are intentionally different types for different files. `parseTelegramBody` has the same signature in both copies. `inlineKeyboard` signature in Task 5 Steps 2 and 3 match. `createTelegramClient()` returns `Telegram` in Task 1 and `Api` in Task 6, and the four call sites use it without naming the type. `fetchTelegramFile(teleBot: Api, fileId: string)` matches its two call sites.
