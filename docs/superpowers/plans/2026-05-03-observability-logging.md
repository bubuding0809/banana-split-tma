# Backend observability + structured logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every backend error visible in Axiom with request-bound context so an agent can reconstruct one user's session from a single `request_id`.

**Architecture:** New `@repo/logger` package wraps pino + an `AsyncLocalStorage` request store. Express middleware assigns a `request_id` per HTTP request. tRPC gains an `errorFormatter` that auto-logs every procedure error and a `ctx.log` child logger pre-bound to request-scoped fields. Bot's existing pretty-print logger middleware is rewritten in pino. Logs flow as JSON to stdout; the Vercel Axiom integration forwards them. Agents query Axiom via the official MCP server (`https://mcp.axiom.co/mcp`).

**Tech Stack:** pino 9, AsyncLocalStorage, Express, @trpc/server, grammy, vitest, supertest.

**Spec:** `docs/superpowers/specs/2026-05-03-observability-logging-design.md`

**Branch:** `feat/observability-logging` (create at start; do all work on this branch in the main workspace — no worktree).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/logger/package.json` | New: package manifest, declares pino dependency |
| `packages/logger/tsconfig.json` | New: extends `@repo/typescript-config/base.json` |
| `packages/logger/eslint.config.mjs` | New: extends `@repo/eslint-config` |
| `packages/logger/src/index.ts` | New: re-exports public surface |
| `packages/logger/src/createLogger.ts` | New: pino factory with `service` field + `LOG_LEVEL` env wiring |
| `packages/logger/src/requestContext.ts` | New: `AsyncLocalStorage` store + `getRequestId()` |
| `packages/logger/src/middleware.ts` | New: `withRequestContext()` and `withRequestLogger()` Express middlewares |
| `packages/logger/src/createLogger.test.ts` | New: pino factory tests |
| `packages/logger/src/requestContext.test.ts` | New: AsyncLocalStorage propagation tests |
| `packages/logger/src/middleware.test.ts` | New: middleware integration tests |
| `apps/lambda/package.json` | Modify: add `@repo/logger` workspace dep |
| `apps/lambda/api/index.ts` | Modify: mount `withRequestContext` + `withRequestLogger` before tRPC; add Express error handler |
| `apps/lambda/api/_observability.test.ts` | New: integration test for request_id propagation + error logging |
| `packages/trpc/package.json` | Modify: add `@repo/logger` workspace dep |
| `packages/trpc/src/trpc.ts` | Modify: tRPC `errorFormatter` adds `requestId` to shape + logs error; auth middleware logs validation failures; `ctx.log` injected |
| `packages/trpc/src/trpc.test.ts` | New: errorFormatter + auth-failure logging tests |
| `packages/trpc/src/routers/**/*.ts` | Modify: ~30 sites — replace `console.error("…", err)` with `ctx.log.error({ err }, "<event.name>")` |
| `apps/bot/package.json` | Modify: add `@repo/logger` workspace dep |
| `apps/bot/src/middleware/logger.ts` | Modify: rewrite as structured pino-backed grammy middleware that assigns `request_id`, logs `bot.update.start` + `bot.update.end` |
| `apps/bot/src/middleware/logger.test.ts` | New: vitest for grammy middleware shape |
| `apps/bot/src/bot.ts` | Modify: replace `bot.catch` body with structured `bot.update.unhandled` log |
| `apps/web/src/routes/_tma/chat.tsx` | Modify: render `Reference: <requestId>` line on the error branch (lines 62-68) |
| `AGENTS.md` | Modify: add "Production observability" section (MCP install, Axiom Skills install, canonical APL templates) |
| `.envrc.example` | Modify: add `AXIOM_TOKEN` + `AXIOM_ORG_ID` placeholder lines |

---

## Pre-task: Branch + commit spec & plan

- [ ] **Step 1: Branch off main**

```bash
cd /Users/bubuding/code/banana-split-tma
git checkout main
git pull --ff-only
git checkout -b feat/observability-logging
```

Expected: clean working tree on the new branch.

- [ ] **Step 2: Confirm spec, deck, and plan are present on disk**

```bash
ls docs/superpowers/specs/2026-05-03-observability-logging-design.md \
   docs/superpowers/specs/2026-05-03-observability-logging-deck.html \
   docs/superpowers/plans/2026-05-03-observability-logging.md
```

Expected: all three files listed.

- [ ] **Step 3: Commit the design artifacts as the first commit on the branch**

```bash
git add docs/superpowers/specs/2026-05-03-observability-logging-design.md \
        docs/superpowers/specs/2026-05-03-observability-logging-deck.html \
        docs/superpowers/plans/2026-05-03-observability-logging.md
git commit -m "docs(observability): spec + plan for backend structured logging"
```

---

## Task 1: Scaffold `@repo/logger` package

**Files:**
- Create: `packages/logger/package.json`
- Create: `packages/logger/tsconfig.json`
- Create: `packages/logger/eslint.config.mjs`
- Create: `packages/logger/src/index.ts`
- Create: `packages/logger/src/createLogger.ts`
- Create: `packages/logger/src/createLogger.test.ts`

- [ ] **Step 1: Create the package manifest**

Write `packages/logger/package.json`:

```json
{
  "name": "@repo/logger",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch --preserveWatchOutput",
    "check-types": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --max-warnings 0"
  },
  "dependencies": {
    "pino": "^9.5.0",
    "pino-std-serializers": "^7.0.0"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/express": "^5.0.0",
    "@types/node": "^25.5.0",
    "express": "^5.0.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0",
    "typescript": "5.8.2",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Create the tsconfig**

Write `packages/logger/tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create the eslint config**

Write `packages/logger/eslint.config.mjs`:

```js
import { config } from "@repo/eslint-config/base";

export default config;
```

(If `@repo/eslint-config` exposes a different entry, mirror what `packages/categories/eslint.config.mjs` does — just copy that file.)

- [ ] **Step 4: Install deps**

```bash
pnpm install
```

Expected: pino, pino-std-serializers, supertest pulled into the new package's `node_modules`.

- [ ] **Step 5: Write the failing test for `createLogger`**

Write `packages/logger/src/createLogger.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createLogger } from "./createLogger.js";

describe("createLogger", () => {
  it("emits structured JSON with the service field", () => {
    const lines: string[] = [];
    const logger = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });

    logger.info({ chat_id: "-100" }, "auth.ok");

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.service).toBe("lambda");
    expect(parsed.msg).toBe("auth.ok");
    expect(parsed.chat_id).toBe("-100");
    expect(parsed.level).toBe(30);
  });

  it("respects LOG_LEVEL env override", () => {
    const lines: string[] = [];
    const logger = createLogger("bot", {
      level: "warn",
      destination: { write: (s) => lines.push(s) },
    });

    logger.info("ignored");
    logger.warn("kept");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).msg).toBe("kept");
  });

  it("serializes errors with type/message/stack", () => {
    const lines: string[] = [];
    const logger = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });

    class ExpiredError extends Error {}
    logger.error({ err: new ExpiredError("Init data is expired") }, "auth.failed");

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.err.type).toBe("ExpiredError");
    expect(parsed.err.message).toBe("Init data is expired");
    expect(parsed.err.stack).toContain("ExpiredError");
  });
});
```

- [ ] **Step 6: Run test to confirm it fails**

```bash
cd packages/logger && pnpm test
```

Expected: FAIL — `createLogger` not exported.

- [ ] **Step 7: Implement `createLogger`**

Write `packages/logger/src/createLogger.ts`:

```ts
import { pino, type Logger, type LoggerOptions, type DestinationStream } from "pino";

export type Service = "lambda" | "bot";

export interface CreateLoggerOptions {
  level?: pino.LevelWithSilent;
  destination?: DestinationStream;
}

export function createLogger(
  service: Service,
  opts: CreateLoggerOptions = {}
): Logger {
  const level =
    opts.level ?? (process.env.LOG_LEVEL as pino.LevelWithSilent | undefined) ?? "info";

  const baseOptions: LoggerOptions = {
    level,
    base: { service },
    serializers: pino.stdSerializers,
    formatters: {
      // Drop pino's default `pid` and `hostname` — they add noise on Vercel.
      bindings: (b) => ({ service: b.service }),
    },
  };

  return opts.destination ? pino(baseOptions, opts.destination) : pino(baseOptions);
}

export type { Logger } from "pino";
```

- [ ] **Step 8: Re-export from package index**

Write `packages/logger/src/index.ts`:

```ts
export { createLogger, type Service, type CreateLoggerOptions, type Logger } from "./createLogger.js";
```

- [ ] **Step 9: Run tests to confirm pass**

```bash
cd packages/logger && pnpm test
```

Expected: PASS — all 3 tests green.

- [ ] **Step 10: Build the package**

```bash
cd packages/logger && pnpm build
```

Expected: `dist/` populated, no TS errors.

- [ ] **Step 11: Commit**

```bash
git add packages/logger pnpm-lock.yaml
git commit -m "feat(logger): scaffold @repo/logger with pino factory"
```

---

## Task 2: Request context via AsyncLocalStorage

**Files:**
- Create: `packages/logger/src/requestContext.ts`
- Create: `packages/logger/src/requestContext.test.ts`
- Modify: `packages/logger/src/index.ts`

- [ ] **Step 1: Write the failing test**

Write `packages/logger/src/requestContext.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runWithRequestContext, getRequestId } from "./requestContext.js";

describe("requestContext", () => {
  it("returns undefined when called outside a request scope", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("propagates request_id through awaited callbacks", async () => {
    const observed: (string | undefined)[] = [];
    await runWithRequestContext({ requestId: "01HXY-test" }, async () => {
      observed.push(getRequestId());
      await Promise.resolve();
      observed.push(getRequestId());
      await new Promise((r) => setTimeout(r, 5));
      observed.push(getRequestId());
    });
    expect(observed).toEqual(["01HXY-test", "01HXY-test", "01HXY-test"]);
  });

  it("isolates concurrent contexts", async () => {
    const results = await Promise.all([
      runWithRequestContext({ requestId: "a" }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getRequestId();
      }),
      runWithRequestContext({ requestId: "b" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRequestId();
      }),
    ]);
    expect(results).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/logger && pnpm test requestContext
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement requestContext**

Write `packages/logger/src/requestContext.ts`:

```ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T> | T
): Promise<T> | T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
```

- [ ] **Step 4: Re-export from index**

Edit `packages/logger/src/index.ts`:

```ts
export { createLogger, type Service, type CreateLoggerOptions, type Logger } from "./createLogger.js";
export {
  runWithRequestContext,
  getRequestContext,
  getRequestId,
  type RequestContext,
} from "./requestContext.js";
```

- [ ] **Step 5: Run tests**

```bash
cd packages/logger && pnpm test
```

Expected: PASS — 6 tests green (3 createLogger + 3 requestContext).

- [ ] **Step 6: Commit**

```bash
git add packages/logger
git commit -m "feat(logger): add AsyncLocalStorage request context"
```

---

## Task 3: Express middlewares (`withRequestContext`, `withRequestLogger`)

**Files:**
- Create: `packages/logger/src/middleware.ts`
- Create: `packages/logger/src/middleware.test.ts`
- Modify: `packages/logger/src/index.ts`

- [ ] **Step 1: Write the failing integration test**

Write `packages/logger/src/middleware.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  withRequestContext,
  withRequestLogger,
} from "./middleware.js";
import { createLogger } from "./createLogger.js";
import { getRequestId } from "./requestContext.js";

describe("withRequestContext", () => {
  it("assigns a UUID request_id available via getRequestId", async () => {
    const app = express();
    let observed: string | undefined;

    app.use(withRequestContext());
    app.get("/x", (_req, res) => {
      observed = getRequestId();
      res.json({ ok: true });
    });

    await request(app).get("/x").expect(200);
    expect(observed).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses incoming x-request-id header when present", async () => {
    const app = express();
    let observed: string | undefined;

    app.use(withRequestContext());
    app.get("/x", (_req, res) => {
      observed = getRequestId();
      res.json({ ok: true });
    });

    await request(app).get("/x").set("x-request-id", "incoming-id").expect(200);
    expect(observed).toBe("incoming-id");
  });
});

describe("withRequestLogger", () => {
  it("logs req.start and req.end with status + duration_ms", async () => {
    const lines: string[] = [];
    const log = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });

    const app = express();
    app.use(withRequestContext());
    app.use(withRequestLogger(log));
    app.get("/x", (_req, res) => res.status(201).json({ ok: true }));

    await request(app).get("/x").expect(201);

    const parsed = lines.map((l) => JSON.parse(l));
    const start = parsed.find((p) => p.msg === "req.start");
    const end = parsed.find((p) => p.msg === "req.end");

    expect(start).toBeDefined();
    expect(start.method).toBe("GET");
    expect(start.path).toBe("/x");
    expect(start.request_id).toMatch(/^[0-9a-f-]{36}$/);

    expect(end).toBeDefined();
    expect(end.status).toBe(201);
    expect(typeof end.duration_ms).toBe("number");
    expect(end.duration_ms).toBeGreaterThanOrEqual(0);
    expect(end.request_id).toBe(start.request_id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/logger && pnpm test middleware
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement middleware**

Write `packages/logger/src/middleware.ts`:

```ts
import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { runWithRequestContext, getRequestId } from "./requestContext.js";
import type { Logger } from "./createLogger.js";

export function withRequestContext(): RequestHandler {
  return (req, _res, next) => {
    const incoming = req.header("x-request-id");
    const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
    runWithRequestContext({ requestId }, () => next());
  };
}

export function withRequestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    const requestId = getRequestId();

    logger.info(
      { request_id: requestId, method: req.method, path: req.path },
      "req.start"
    );

    res.on("finish", () => {
      logger.info(
        {
          request_id: requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms: Date.now() - start,
        },
        "req.end"
      );
    });

    next();
  };
}
```

- [ ] **Step 4: Re-export from index**

Edit `packages/logger/src/index.ts`:

```ts
export { createLogger, type Service, type CreateLoggerOptions, type Logger } from "./createLogger.js";
export {
  runWithRequestContext,
  getRequestContext,
  getRequestId,
  type RequestContext,
} from "./requestContext.js";
export { withRequestContext, withRequestLogger } from "./middleware.js";
```

- [ ] **Step 5: Run tests**

```bash
cd packages/logger && pnpm test
```

Expected: PASS — 8 tests green.

- [ ] **Step 6: Build + lint**

```bash
cd packages/logger && pnpm build && pnpm lint
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/logger
git commit -m "feat(logger): add Express request context + request logger middleware"
```

---

## Task 4: Wire logger into the lambda Express app

**Files:**
- Modify: `apps/lambda/package.json`
- Modify: `apps/lambda/api/index.ts`
- Create: `apps/lambda/api/_observability.test.ts`

- [ ] **Step 1: Add workspace dep**

Edit `apps/lambda/package.json` to add `@repo/logger` under `dependencies`:

```json
"dependencies": {
  "@repo/logger": "workspace:*",
  ...existing entries...
}
```

Then:

```bash
pnpm install
```

- [ ] **Step 2: Write failing integration test**

Write `apps/lambda/api/_observability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  createLogger,
  withRequestContext,
  withRequestLogger,
} from "@repo/logger";

describe("lambda observability", () => {
  it("returns x-request-id header on every response and logs req.start/end", async () => {
    const lines: string[] = [];
    const log = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });

    const app = express();
    app.use(withRequestContext());
    app.use(withRequestLogger(log));
    app.get("/health", (_req, res) => res.json({ ok: true }));

    const r = await request(app).get("/health").expect(200);
    expect(r.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const events = lines.map((l) => JSON.parse(l).msg);
    expect(events).toContain("req.start");
    expect(events).toContain("req.end");
  });
});
```

This test will fail because the middleware does not currently echo `x-request-id` back on the response. We'll fix that next.

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/lambda && pnpm test _observability
```

Expected: FAIL — `x-request-id` header missing.

- [ ] **Step 4: Echo `x-request-id` from `withRequestContext`**

Edit `packages/logger/src/middleware.ts`. Replace `withRequestContext` body with:

```ts
export function withRequestContext(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header("x-request-id");
    const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader("x-request-id", requestId);
    runWithRequestContext({ requestId }, () => next());
  };
}
```

- [ ] **Step 5: Run logger tests to confirm no regression**

```bash
cd packages/logger && pnpm test
```

Expected: PASS — 8 tests still green.

- [ ] **Step 6: Wire into lambda entry**

Edit `apps/lambda/api/index.ts`. Add this import block near the top, alongside the other `@dko/*` imports:

```ts
import {
  createLogger,
  withRequestContext,
  withRequestLogger,
} from "@repo/logger";
```

Then, immediately after `app.use(cors());` (around line 30), add:

```ts
const log = createLogger("lambda");
app.use(withRequestContext());
app.use(withRequestLogger(log));
```

At the very end of the file (after the health-check route, before `export default app;`), add the Express error handler:

```ts
app.use(
  (
    err: unknown,
    req: import("express").Request,
    res: import("express").Response,
    _next: import("express").NextFunction
  ) => {
    log.error(
      { err, request_id: res.getHeader("x-request-id"), path: req.path },
      "req.unhandled"
    );
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
```

- [ ] **Step 7: Run integration test**

```bash
cd apps/lambda && pnpm test _observability
```

Expected: PASS.

- [ ] **Step 8: Run lambda test suite**

```bash
cd apps/lambda && pnpm test
```

Expected: PASS — existing tests (`_chat-photo`, `_recurring-expense-tick`, `_redact`) unaffected.

- [ ] **Step 9: Build the lambda**

```bash
cd apps/lambda && pnpm build
```

Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add packages/logger apps/lambda pnpm-lock.yaml
git commit -m "feat(observability): wire @repo/logger into lambda + echo x-request-id"
```

---

## Task 5: tRPC `errorFormatter` + `ctx.log`

**Files:**
- Modify: `packages/trpc/package.json`
- Modify: `packages/trpc/src/trpc.ts`
- Create: `packages/trpc/src/trpc.test.ts`

- [ ] **Step 1: Add workspace dep**

Edit `packages/trpc/package.json` and add under `dependencies`:

```json
"@repo/logger": "workspace:*",
```

Then:

```bash
pnpm install
```

- [ ] **Step 2: Write failing test for errorFormatter + ctx.log**

Write `packages/trpc/src/trpc.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { validateMock, parseMock } = vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  process.env.API_KEY = "test-api-key";
  process.env.INTERNAL_AGENT_KEY = "test-internal-agent-key";
  process.env.RECURRING_EXPENSE_WEBHOOK_SECRET = "x".repeat(64);
  return {
    validateMock: vi.fn(),
    parseMock: vi.fn(),
  };
});

vi.mock("@telegram-apps/init-data-node", () => ({
  validate: validateMock,
  parse: parseMock,
}));

vi.mock("@dko/database", () => ({
  prisma: {
    user: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import { initTRPC } from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import { z } from "zod";
import {
  createLogger,
  withRequestContext,
  withRequestLogger,
} from "@repo/logger";

// Reuse the real trpc.ts setup
import {
  protectedProcedure,
  createTRPCRouter,
  withCreateTRPCContext,
} from "./trpc.js";

beforeEach(() => {
  validateMock.mockReset();
  parseMock.mockReset();
});

describe("tRPC observability", () => {
  it("includes requestId in the shaped error response", async () => {
    validateMock.mockImplementation(() => {
      throw new Error("Init data is expired");
    });

    const router = createTRPCRouter({
      ping: protectedProcedure
        .input(z.object({}))
        .query(() => ({ ok: true })),
    });

    const app = express();
    app.use(withRequestContext());
    app.use("/trpc", trpcExpress.createExpressMiddleware({
      router,
      createContext: withCreateTRPCContext({ TELEGRAM_BOT_TOKEN: "tok" } as any),
    }));

    const r = await request(app)
      .get("/trpc/ping?input=%7B%7D")
      .set("authorization", "tma BAD")
      .expect(200);

    expect(r.body.error.data.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.body.error.data.code).toBe("UNAUTHORIZED");
  });

  it("logs auth.initData.failed exactly once on a bad initData", async () => {
    validateMock.mockImplementation(() => {
      throw new Error("Init data is expired");
    });

    const lines: string[] = [];
    const log = createLogger("lambda", {
      destination: { write: (s) => lines.push(s) },
    });

    const router = createTRPCRouter({
      ping: protectedProcedure
        .input(z.object({}))
        .query(() => ({ ok: true })),
    });

    const app = express();
    app.use(withRequestContext());
    app.use(withRequestLogger(log));
    app.use("/trpc", trpcExpress.createExpressMiddleware({
      router,
      createContext: withCreateTRPCContext({ TELEGRAM_BOT_TOKEN: "tok" } as any),
      onError: ({ error, path }) => {
        log.error(
          { err: error, code: error.code, procedure: path },
          "trpc.procedure.error"
        );
      },
    }));

    await request(app)
      .get("/trpc/ping?input=%7B%7D")
      .set("authorization", "tma BAD")
      .expect(200);

    const authFailures = lines
      .map((l) => JSON.parse(l))
      .filter((p) => p.msg === "auth.initData.failed");
    expect(authFailures).toHaveLength(1);
    expect(authFailures[0].err.message).toBe("Init data is expired");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/trpc && pnpm test trpc.test
```

Expected: FAIL — `requestId` not in shape; `auth.initData.failed` not logged.

- [ ] **Step 4: Add `errorFormatter` and ctx.log to `trpc.ts`**

Edit `packages/trpc/src/trpc.ts`. At the top, add:

```ts
import {
  createLogger,
  getRequestId,
  type Logger,
} from "@repo/logger";

const trpcLogger = createLogger("lambda");
```

Replace the existing `const t = initTRPC...create({...})` block (lines 61-67) with:

```ts
const t = initTRPC
  .context<typeof createTRPCContext>()
  .meta<OpenApiMeta>()
  .create({
    transformer: superjson,
    isServer: true,
    errorFormatter({ shape, error, ctx, path }) {
      const requestId = getRequestId();
      // Skip NOT_FOUND — that's expected (e.g., new user). Log everything else.
      if (error.code !== "NOT_FOUND") {
        trpcLogger.error(
          {
            err: error.cause ?? error,
            code: error.code,
            procedure: path,
            request_id: requestId,
            user_id: (ctx as any)?.session?.user?.id?.toString(),
            chat_id: (ctx as any)?.session?.chatId?.toString(),
          },
          "trpc.procedure.error"
        );
      }
      return {
        ...shape,
        data: {
          ...shape.data,
          requestId,
        },
      };
    },
  });
```

Update the `createTRPCContext` factory (lines 28-41) to add `log`:

```ts
const createTRPCContext = ({
  botToken,
  ...rest
}: Record<string, unknown> & {
  botToken: string;
}) => {
  const requestId = getRequestId();
  const log: Logger = trpcLogger.child({ request_id: requestId });
  return {
    db: prisma as typeof prisma,
    teleBot: new Telegram(botToken),
    request: rest.req,
    response: rest.res,
    info: rest.info,
    log,
  };
};
```

- [ ] **Step 5: Update protectedProcedure to bind chat/user/procedure to ctx.log**

In the `protectedProcedure` definition (line 75), at the very end of the middleware (just before `return next({ ctx: { session: ... } });`), update the `next` call to also rebind `log`:

```ts
return next({
  ctx: {
    session: { user, authType, chatId },
    log: ctx.log.child({
      auth_type: authType,
      user_id: user?.id?.toString(),
      chat_id: chatId?.toString(),
    }),
  },
});
```

- [ ] **Step 6: Run tests**

```bash
cd packages/trpc && pnpm test trpc.test
```

Expected: PASS — both tests green.

- [ ] **Step 7: Run full trpc test suite**

```bash
cd packages/trpc && pnpm test
```

Expected: PASS — no regressions.

- [ ] **Step 8: Commit**

```bash
git add packages/trpc pnpm-lock.yaml
git commit -m "feat(trpc): add errorFormatter + ctx.log child logger with request context"
```

---

## Task 6: Instrument the auth middleware

**Files:**
- Modify: `packages/trpc/src/trpc.ts:259-264`

The auth middleware currently catches `validateInitData` failures with no log line. The test in Task 5 already proves we need `auth.initData.failed` to fire — but our errorFormatter only runs for the procedure-level error, not the middleware-level throw (the throw IS the procedure error here). However, we want the *cause* logged separately because the rethrown UNAUTHORIZED loses the underlying error class.

- [ ] **Step 1: Add the log line in the auth catch block**

Edit `packages/trpc/src/trpc.ts`. Find the catch block (currently lines 259-264) inside the Telegram-auth path:

```ts
} catch (error) {
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "Invalid Telegram authentication",
  });
}
```

Replace with:

```ts
} catch (error) {
  trpcLogger.warn(
    {
      err: error,
      request_id: getRequestId(),
    },
    "auth.initData.failed"
  );
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "Invalid Telegram authentication",
  });
}
```

- [ ] **Step 2: Update the trpc.test.ts assertion**

The Task 5 test already asserts `auth.initData.failed` fires — re-run it.

```bash
cd packages/trpc && pnpm test trpc.test
```

Expected: PASS — `auth.initData.failed` exactly once with `err.message: "Init data is expired"`.

- [ ] **Step 3: Add a similar log at the API-key revoke and chat-key revoke catch points**

In the same file (`packages/trpc/src/trpc.ts`), find the two `throw new TRPCError({ code: "UNAUTHORIZED", message: "API key has been revoked" })` lines (around lines 188-193 and 203-208).

For each, add a `trpcLogger.warn(...)` immediately before the throw:

```ts
trpcLogger.warn(
  { request_id: getRequestId(), reason: "api_key_revoked" },
  "auth.apiKey.revoked"
);
throw new TRPCError({ ... });
```

Apply to BOTH revoked-key checks.

- [ ] **Step 4: Add a log at the "Invalid API key" throw**

Find the `throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid API key" })` (around line 217-220). Add immediately before:

```ts
trpcLogger.warn(
  { request_id: getRequestId(), reason: "invalid_api_key" },
  "auth.apiKey.invalid"
);
```

- [ ] **Step 5: Run tests**

```bash
cd packages/trpc && pnpm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/trpc.ts
git commit -m "feat(observability): log auth-middleware failures before rethrow"
```

---

## Task 7: Replace bot logger middleware with structured pino

**Files:**
- Modify: `apps/bot/package.json`
- Rewrite: `apps/bot/src/middleware/logger.ts`
- Create: `apps/bot/src/middleware/logger.test.ts`
- Modify: `apps/bot/src/bot.ts`

- [ ] **Step 1: Add workspace dep**

Edit `apps/bot/package.json`, add to `dependencies`:

```json
"@repo/logger": "workspace:*",
```

Then:

```bash
pnpm install
```

- [ ] **Step 2: Write failing test for the new middleware shape**

Write `apps/bot/src/middleware/logger.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createLogger } from "@repo/logger";

// We can't easily run grammy's full middleware without bootstrapping
// the whole bot, so test the middleware as a function-level unit.
import { makeLoggerMiddleware } from "./logger.js";

describe("bot logger middleware", () => {
  it("logs bot.update.start with request_id and chat/user context", async () => {
    const lines: string[] = [];
    const log = createLogger("bot", {
      destination: { write: (s) => lines.push(s) },
    });

    const middleware = makeLoggerMiddleware(log);
    const ctx: any = {
      update: { update_id: 42 },
      message: { text: "/start" },
      chat: { id: -123 },
      from: { id: 9, username: "alice" },
    };

    await middleware(ctx, async () => {});

    const start = lines.map((l) => JSON.parse(l)).find((p) => p.msg === "bot.update.start");
    expect(start).toBeDefined();
    expect(start.update_id).toBe(42);
    expect(start.chat_id).toBe("-123");
    expect(start.user_id).toBe("9");
    expect(start.username).toBe("alice");
    expect(start.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctx.log).toBeDefined();
    expect(ctx.requestId).toBe(start.request_id);
  });

  it("logs bot.update.unhandled when next throws", async () => {
    const lines: string[] = [];
    const log = createLogger("bot", {
      destination: { write: (s) => lines.push(s) },
    });

    const middleware = makeLoggerMiddleware(log);
    const ctx: any = { update: { update_id: 7 } };

    await expect(
      middleware(ctx, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const fail = lines.map((l) => JSON.parse(l)).find((p) => p.msg === "bot.update.unhandled");
    expect(fail).toBeDefined();
    expect(fail.err.message).toBe("boom");
    expect(fail.update_id).toBe(7);
  });

  it("logs bot.update.end with duration on success", async () => {
    const lines: string[] = [];
    const log = createLogger("bot", {
      destination: { write: (s) => lines.push(s) },
    });

    const middleware = makeLoggerMiddleware(log);
    const ctx: any = { update: { update_id: 1 } };

    await middleware(ctx, async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    const end = lines.map((l) => JSON.parse(l)).find((p) => p.msg === "bot.update.end");
    expect(end).toBeDefined();
    expect(end.duration_ms).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/bot && pnpm test logger
```

Expected: FAIL — `makeLoggerMiddleware` not exported.

- [ ] **Step 4: Rewrite the bot logger middleware**

Replace `apps/bot/src/middleware/logger.ts` entirely with:

```ts
import { randomUUID } from "node:crypto";
import { type Middleware } from "grammy";
import { createLogger, type Logger } from "@repo/logger";
import { type BotContext } from "../types.js";

declare module "../types.js" {
  interface BotContext {
    log: Logger;
    requestId: string;
  }
}

export function makeLoggerMiddleware(log: Logger): Middleware<BotContext> {
  return async (ctx, next) => {
    const requestId = randomUUID();
    const updateId = ctx.update.update_id;
    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id?.toString();
    const username = ctx.from?.username;

    const child = log.child({
      request_id: requestId,
      update_id: updateId,
      chat_id: chatId,
      user_id: userId,
      username,
    });

    ctx.log = child;
    ctx.requestId = requestId;

    let action: string | undefined;
    if (ctx.message?.text) action = ctx.message.text;
    else if (ctx.callbackQuery?.data) action = `cb:${ctx.callbackQuery.data}`;
    else if (ctx.inlineQuery?.query) action = `inline:${ctx.inlineQuery.query}`;
    else if (ctx.myChatMember) action = "my_chat_member";

    child.info(
      { action, update_type: action ? action.split(":")[0] : "other" },
      "bot.update.start"
    );

    const start = Date.now();
    try {
      await next();
      child.info(
        { duration_ms: Date.now() - start },
        "bot.update.end"
      );
    } catch (err) {
      child.error(
        { err, duration_ms: Date.now() - start },
        "bot.update.unhandled"
      );
      throw err;
    }
  };
}

export const loggerMiddleware = makeLoggerMiddleware(createLogger("bot"));
```

Note the `declare module` block — it augments the `BotContext` type with the new `log` and `requestId` fields without needing to edit `types.ts` separately. (If `types.ts` is the canonical place for these, move the augmentation there; otherwise this co-located augmentation is fine and isolates the bot middleware concern.)

- [ ] **Step 5: Update `apps/bot/src/bot.ts` `bot.catch` to use structured logging**

Edit `apps/bot/src/bot.ts`. Replace the existing `bot.catch(...)` block at the bottom with:

```ts
import { createLogger } from "@repo/logger";
const botLog = createLogger("bot");

bot.catch((err) => {
  botLog.error(
    {
      err: err.error,
      update_id: err.ctx.update.update_id,
      chat_id: err.ctx.chat?.id?.toString(),
    },
    "bot.unhandled"
  );
});
```

(The `import` and `botLog` lines go near the top of the file with the other imports; the `bot.catch` block stays at the bottom.)

- [ ] **Step 6: Run tests**

```bash
cd apps/bot && pnpm test
```

Expected: PASS — 3 logger middleware tests green; existing bot tests (if any) unaffected.

- [ ] **Step 7: Build the bot**

```bash
cd apps/bot && pnpm build
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/bot pnpm-lock.yaml
git commit -m "feat(observability): structured pino logging for bot middleware + bot.catch"
```

---

## Task 8: Mechanical sweep — replace `console.error` in tRPC routers

**Files:**
- Modify: ~30 files under `packages/trpc/src/routers/**/*.ts`

The full list, captured during investigation:

```
packages/trpc/src/routers/expense/deleteExpense.ts:67
packages/trpc/src/routers/expense/convertCurrencyBulk.ts:193
packages/trpc/src/routers/expense/createExpenseWithRecurrence.ts:175
packages/trpc/src/routers/expense/sendBatchExpenseSummary.ts:270
packages/trpc/src/routers/expense/updateExpense.ts:653
packages/trpc/src/routers/expense/updateExpense.ts:717
packages/trpc/src/routers/expense/createExpense.ts:478
packages/trpc/src/routers/expense/recurring/cancel.ts:54
packages/trpc/src/routers/snapshot/shareSnapshotMessage.ts:623
packages/trpc/src/routers/snapshot/createSnapshot.ts (info-level breadcrumbs — leave for now)
packages/trpc/src/routers/settlement/settleAllDebts.ts:155
packages/trpc/src/routers/settlement/deleteSettlement.ts:59
packages/trpc/src/routers/settlement/createSettlement.ts:135
packages/trpc/src/routers/chat/createChat.ts:90
packages/trpc/src/routers/chat/updateChat.ts:110
packages/trpc/src/routers/chat/migrateChat.ts:197
packages/trpc/src/routers/chat/migrateChat.ts:247
packages/trpc/src/routers/chat/migrateChat.ts:266
packages/trpc/src/routers/ai/classifyExpenseDescription.ts:114
packages/trpc/src/routers/category/suggestCategory.ts:53 (warn — keep but rewrite)
packages/trpc/src/routers/user/createUser.ts:74
packages/trpc/src/routers/telegram/sendExpenseNotificationMessage.ts:246
packages/trpc/src/routers/telegram/deleteExpenseNotificationMessage.ts:51
packages/trpc/src/routers/telegram/sendGroupReminderMessage.ts:252
packages/trpc/src/routers/telegram/editExpenseNotificationMessage.ts:121
packages/trpc/src/routers/telegram/editExpenseNotificationMessage.ts:191
packages/trpc/src/routers/telegram/editExpenseNotificationMessage.ts:232
packages/trpc/src/routers/telegram/sendSettlementNotificationMessage.ts:85
packages/trpc/src/routers/telegram/sendCurrencyConversionNotificationMessage.ts:96
packages/trpc/src/routers/telegram/sendDebtReminderMessage.ts:56
packages/trpc/src/routers/aws/createGroupReminderSchedule.ts:239
packages/trpc/src/routers/aws/createRecurringSchedule.ts:278
```

Pattern transformation: each `console.error("Some message:", err)` becomes `ctx.log.error({ err }, "domain.event.failed")`. Pick a kebab-event-name that's specific. Examples:

| Old | New event name |
|---|---|
| `console.error("Failed to create group reminder schedule:", error)` | `"schedule.create.failed"` |
| `console.error("Error sending expense notification message:", error)` | `"telegram.expenseNotification.failed"` |
| `console.error("Error migrating chat:", error)` | `"chat.migrate.failed"` |
| `console.error("Failed to delete recurring schedule for expense", ...)` | `"schedule.delete.failed"` |

- [ ] **Step 1: Walk the list above**

For each file/line, replace the `console.error` (or `console.warn`) with the equivalent `ctx.log.error({ err: <var> }, "<event>")` (or `ctx.log.warn`). Preserve any structured fields in the original log call.

Tip: the procedure handler signature already destructures `ctx`, so `ctx.log` is in scope. If a helper function below the procedure uses `console.error` and doesn't have `ctx`, pass `ctx.log` (or just `log`) down as a parameter.

- [ ] **Step 2: Run the trpc test suite**

```bash
cd packages/trpc && pnpm test
```

Expected: PASS — no behavior changed, only logging surface.

- [ ] **Step 3: Run check-types across the workspace**

```bash
cd /Users/bubuding/code/banana-split-tma && pnpm check-types
```

Expected: PASS — `ctx.log` resolves on every call site.

- [ ] **Step 4: Spot-check a couple of files visually**

Open `packages/trpc/src/routers/chat/migrateChat.ts` and verify the three replaced sites read clean (no leftover `console.*`).

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers
git commit -m "refactor(observability): replace ad-hoc console.error in routers with ctx.log"
```

---

## Task 9: TMA error screen — show requestId reference

**Files:**
- Modify: `apps/web/src/routes/_tma/chat.tsx:62-68`

- [ ] **Step 1: Edit the error branch**

Edit `apps/web/src/routes/_tma/chat.tsx`. Replace the existing error branch (lines 61-68):

```tsx
// Other errors, show error message
return (
  <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
    <Text className="text-red-500">
      Something went wrong, please try again later.
    </Text>
  </main>
);
```

with:

```tsx
// Other errors, show error message
const requestId = (getUserDataError?.data as { requestId?: string } | undefined)?.requestId;
return (
  <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
    <Text className="text-red-500">
      Something went wrong, please try again later.
    </Text>
    {requestId && (
      <Caption weight="3" className="text-muted-foreground">
        Reference: {requestId}
      </Caption>
    )}
  </main>
);
```

- [ ] **Step 2: Run check-types**

```bash
cd apps/web && pnpm check-types
```

Expected: PASS.

- [ ] **Step 3: Manual visual smoke (when running dev server)**

There is no automated UI test for this; the user will UAT manually post-deploy. Skip running the dev server for this task — UAT happens after the PR is up.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_tma/chat.tsx
git commit -m "feat(tma): show requestId reference on the error screen"
```

---

## Task 10: AGENTS.md observability runbook + .envrc.example

**Files:**
- Modify: `AGENTS.md`
- Modify: `.envrc.example`

- [ ] **Step 1: Add `AXIOM_*` placeholders to .envrc.example**

Edit `.envrc.example`. Append:

```sh

# Axiom (production observability)
# Generate a personal access token at https://app.axiom.co > Profile > Tokens
# Find your org id at https://app.axiom.co > Settings > Profile
export AXIOM_TOKEN="your_axiom_token_here"
export AXIOM_ORG_ID="your_axiom_org_id_here"
```

- [ ] **Step 2: Add the "Production observability" section to AGENTS.md**

Edit `AGENTS.md`. Append the following new section (place it after the existing "Agent Tooling" section):

```markdown
## Production observability

Backend logs from `apps/lambda` (tRPC API) and `apps/bot` (Telegram webhook) flow as structured JSON to Axiom via the Vercel marketplace integration.

### Agent access — Axiom MCP

Add the Axiom MCP server once per machine. Headless (recommended for SSH / CI):

```bash
claude mcp add --transport http axiom https://mcp.axiom.co/mcp \
  --header "Authorization: Bearer $AXIOM_TOKEN" \
  --header "x-axiom-org-id: $AXIOM_ORG_ID"
```

OAuth alternative (Claude Desktop, local dev with browser):

```bash
claude mcp add --transport http axiom https://mcp.axiom.co/mcp
```

`AXIOM_TOKEN` + `AXIOM_ORG_ID` live in `.envrc` (loaded by direnv on `cd`).

### Agent skills — methodology

Install the Axiom skills suite once per machine:

```bash
npx skills add axiomhq/skills
```

The **System Reliability Engineering (SRE)** skill is the entry point for incident investigation — load it before reaching for queries.

Create `~/.axiom.toml` with the same token + org id (Skills config lives outside the repo):

```toml
[deployments.dev]
url = "https://api.axiom.co"
token = "$AXIOM_TOKEN value"
org_id = "$AXIOM_ORG_ID value"
```

### Canonical APL queries

Replace `$AXIOM_DATASET` with the value from `.envrc` (or pull from env in scripts). The MCP `queryApl` tool accepts these directly.

**One request's full timeline** (most common — start here when the user pastes a "Reference: …" id from the error screen):

```apl
['$AXIOM_DATASET']
| where ['service'] == "lambda" or ['service'] == "bot"
| where ['request_id'] == "{{REQUEST_ID}}"
| sort by _time asc
| project _time, level, msg, ['err.type'], ['err.message'], ['err.code'], procedure, duration_ms, status
```

**All errors for one chat in the last hour:**

```apl
['$AXIOM_DATASET']
| where _time > ago(1h)
| where ['chat_id'] == "{{CHAT_ID}}"
| where ['level'] >= 40
| sort by _time desc
```

**Auth failures over time:**

```apl
['$AXIOM_DATASET']
| where ['msg'] == "auth.initData.failed"
| summarize count() by bin_auto(_time)
```

**Slowest procedures p95:**

```apl
['$AXIOM_DATASET']
| where ['msg'] == "req.end" and ['service'] == "lambda"
| summarize p95 = percentile(['duration_ms'], 95) by ['path']
| sort by p95 desc
```

### Reference id flow

When a user sees "Something went wrong" in the TMA, the screen renders `Reference: <request_id>` below the error. Paste the id into the canonical timeline query above; the result tells the full story including `err.type` (e.g. `ExpiredError`).
```

- [ ] **Step 3: Run a doc-lint sanity (if any)**

```bash
cd /Users/bubuding/code/banana-split-tma && pnpm format:check
```

Expected: PASS (if it formats markdown). If it fails, run `pnpm format`.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md .envrc.example
git commit -m "docs: add Axiom MCP + Skills observability runbook"
```

---

## Final: Push branch + open PR

- [ ] **Step 1: Run the full check suite**

```bash
cd /Users/bubuding/code/banana-split-tma && pnpm lint && pnpm check-types && pnpm test
```

Expected: all green.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/observability-logging
```

- [ ] **Step 3: Open the PR (no auto-merge until UAT)**

```bash
gh pr create --title "feat(observability): structured logging + Axiom integration" --body "$(cat <<'EOF'
## Summary
- Adds `@repo/logger` (pino + AsyncLocalStorage request context + Express middleware)
- tRPC `errorFormatter` auto-logs every procedure error and surfaces `requestId` in the error shape
- Auth middleware logs validation failures (no longer silent)
- Bot logger middleware rewritten in pino with `request_id` per update + structured `bot.catch`
- ~30 ad-hoc `console.error` sites in tRPC routers replaced with `ctx.log.error`
- TMA error screen shows `Reference: <id>` so users can hand the id to an agent
- `AGENTS.md` runbook for Axiom MCP + Skills + canonical APL queries

## Spec
`docs/superpowers/specs/2026-05-03-observability-logging-design.md`

## UAT
Manual after deploy:
- Open the TMA. Wipe initData, retry — confirm "Something went wrong" + Reference id renders
- Paste the id into Axiom MCP `queryApl` with the canonical timeline query — confirm the full request story (auth.initData.failed → ExpiredError)
- Confirm `req.start` + `req.end` lines in Axiom for healthy requests

## Follow-up (separate PR)
Bump `validateInitData` expiry to 7 days once we confirm `ExpiredError` is the dominant failure mode.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Tag /oc on the PR**

After the PR opens, comment on it:

```bash
gh pr comment <pr-number> --body "/oc"
```

This kicks off Claude PR review per the standing convention. Address review findings in follow-up commits on the same branch. **Do NOT enable auto-merge** until UAT is complete (per project convention).

- [ ] **Step 5: Vercel-side setup (user does this once after PR merges)**

After the PR lands and deploys to prod:

1. Open Vercel dashboard → `banana-split-tma-lambda` → Integrations → Marketplace → install Axiom. Repeat for `banana-split-tma-bot`. The integration auto-injects `AXIOM_TOKEN` + `AXIOM_DATASET` into the function runtime and forwards stdout to Axiom.
2. In Axiom UI, configure the three monitors:
   - **Auth failures spike**: filter `service = "lambda" and msg = "auth.initData.failed"`, alert if `count() > 20` over 5 min.
   - **Procedure error spike**: filter `service = "lambda" and msg = "trpc.procedure.error" and ['err.code'] != "NOT_FOUND"`, alert if `count() > 50` over 5 min.
   - **Request p95 latency regression**: filter `service = "lambda" and msg = "req.end"`, alert if `percentile(duration_ms, 95) > 2000` over 10 min.

---

## Self-review checklist (run after writing the plan)

| Spec section | Covered by | Status |
|---|---|---|
| Component 1 — `packages/logger` | Tasks 1, 2, 3 | ✅ |
| Component 2 — Lambda wiring | Task 4 | ✅ |
| Component 3 — tRPC `errorFormatter` + `ctx.log` | Task 5 | ✅ |
| Component 4 — Auth middleware logging | Task 6 | ✅ |
| Component 5 — Bot middleware | Task 7 | ✅ |
| Component 6 — TMA Reference id | Task 9 | ✅ |
| Component 7 — Agent access (MCP + Skills) | Task 10 | ✅ |
| Replace ad-hoc console.error | Task 8 | ✅ |
| Log schema | Built into Tasks 3, 5, 7 | ✅ |
| Alerting | Final step (Vercel-side, post-merge) | ✅ |
| Rollout: 3 commits in one PR | Tasks group naturally into ~10 commits — same single PR | ✅ |
