# Backend observability + structured logging

## Summary

Add structured JSON logging to `apps/lambda` and `apps/bot`, ship it to Axiom directly over HTTP from inside the function (the Vercel marketplace Axiom integration uses Log Drains, which are Pro-only — we're on Hobby), and instrument the request path so every error carries enough context for an agent to reconstruct the full story from a single `request_id`. Replace ad-hoc `console.*` calls with a shared `pino` logger, add an Express request-context middleware, a tRPC `errorFormatter`, and Telegraf middleware. Surface the request id on the TMA error screen so users can hand it to the agent. Keep environment-specific values (Axiom token, dataset, dashboard URL) in `.envrc`; document only patterns and placeholders in `AGENTS.md`.

## Problem / Background

On 2026-05-03 we investigated an intermittent "Something went wrong" error users hit when opening the TMA via deep link `https://t.me/BananaSplitzBot?startapp=v1_g_-hFy8M9g`. The error screen at `apps/web/src/routes/_tma/chat.tsx:62-68` fires whenever `trpc.user.getUser` returns any error code other than `NOT_FOUND`. The two realistic non-`NOT_FOUND` codes are `UNAUTHORIZED` (initData validation failed) and `INTERNAL_SERVER_ERROR` (DB error swallowed by `getUser`'s catch).

The investigation could not identify which one was firing. Reasons:

- **No logging in the auth middleware catch.** `packages/trpc/src/trpc.ts:259-264` rethrows any `validateInitData` failure as `UNAUTHORIZED` without writing a single log line.
- **No logging in the `getUser` catch.** `packages/trpc/src/routers/user/getUser.ts:34-43` swallows every Prisma error into a generic `INTERNAL_SERVER_ERROR`, again silently.
- **tRPC procedure errors return HTTP 200 with the error embedded in the body.** Vercel access logs show `200`, so they don't surface in the "5xx" view.
- **No tRPC `errorFormatter` is configured** at `packages/trpc/src/trpc.ts:61-67`, so procedure errors never get a chance to log themselves.
- A 5,000-record / 1-hour window of `vercel logs banana-split-tma-lambda` returned **zero** error or warning entries.

Result: a real bug that affected real users was effectively invisible. We could not tell whether the auth check failed because of a stale `auth_date`, a bot-token mismatch, or a transient Prisma connection issue. The next investigation will hit the same wall unless we change the production telemetry surface.

The chosen first fix (bumping the initData expiry to 7 days) is queued for a follow-up PR. This spec covers the prerequisite: making errors visible.

## Goals

1. Every tRPC procedure error and Telegraf bot error produces exactly one structured log line in production.
2. Every log line carries a `request_id` (and `user_id` / `chat_id` when known) so an agent can reconstruct one user's session from a single query.
3. An agent running in this repo can query production logs via a documented APL recipe in `AGENTS.md` and an `axiom` CLI on the dev shell — no manual dashboard hunting.
4. Three Axiom monitors fire on auth-failure spikes, error-code spikes, and p95 latency regressions.

## Non-goals

- TMA web frontend logging. Browser-side error capture is deferred to v2.
- CLI / admin / mcp / video-studio observability. Those surfaces don't drive user-facing errors.
- OpenTelemetry traces. Pino's structured logs answer current questions; spans are overkill until we have a perf question they can't.
- Replacing every existing `console.log` in non-error paths (e.g. the `"Start createSnapshotHandler"` debug line). Mechanical rewrite limited to error logs and the Express + tRPC + Telegraf entry points.

## Solution

A new shared package, two new middlewares, one tRPC config change, and a small UX touch on the error screen. All shipped behind a single PR with three commits.

### Component 1 — `packages/logger`

New shared package. Exports:

- `createLogger(service: "lambda" | "bot")` — returns a configured pino instance. Output is line-delimited JSON to stdout. `LOG_LEVEL` env var controls level (default `info` in prod, `debug` in dev). Uses `pino.stdSerializers.err` so thrown errors get serialized with class, message, and trimmed stack.
- `withRequestContext()` Express middleware — assigns `request_id = crypto.randomUUID()`, stores it in an `AsyncLocalStorage` so the request id is available anywhere in the call tree without prop-drilling.
- `withRequestLogger()` Express middleware — logs `req.start` on entry and `req.end` on response finish, with `duration_ms`, `status`, and the request id.
- `getRequestId()` — pulls the current request id out of async storage. Used by tRPC context.

Dependencies added: `pino`, `pino-std-serializers`, `@axiomhq/js`. The logger uses `pino.multistream` to fan every line out to stdout (preserves Vercel's built-in log view as a fallback) and to Axiom over HTTP via the `@axiomhq/js` client when `AXIOM_TOKEN` + `AXIOM_DATASET` are present. No worker thread — `axiom.ingest()` queues in-memory and POSTs in the background. The logger also exports `flush()` so handlers can `await` (or `waitUntil`) it before serverless tear-down.

### Component 2 — Lambda wiring

`apps/lambda/api/index.ts` mounts the two middlewares before the tRPC adapter and adds an Express `errorHandler` last:

```ts
app.use(withRequestContext());
app.use(withRequestLogger(createLogger("lambda")));
// ... existing routes + tRPC adapter ...
app.use(errorHandler); // logs any non-tRPC route error before responding
```

### Component 3 — tRPC `errorFormatter` + `ctx.log`

`packages/trpc/src/trpc.ts` gets two changes:

1. **`errorFormatter`** on `initTRPC.create({...})`. Every procedure error is logged once at `error` level with `procedure`, `code`, `message`, `cause`, plus the request-bound context. The shaped error returned to the client gains a `requestId` field so the TMA can surface it.

2. **`ctx.log`** added to `createTRPCContext`. It's a pino child logger pre-bound to `{ request_id, procedure, user_id, chat_id, auth_type }`. Procedures call `ctx.log.error({ err }, "expense.create.failed")` instead of `console.error("…", err)`. The child logger inherits the request id automatically; procedures never have to thread it.

The auth middleware (lines 226-273) gets one line per failure mode before rethrowing as `UNAUTHORIZED` — `ctx.log.warn({ err }, "auth.initData.failed")`. That single change converts today's silent UNAUTHORIZED into a queryable event.

### Component 4 — Replace ad-hoc `console.*` in error paths

Mechanical sweep across `packages/trpc/src/routers/**`. Roughly 30 call sites identified during investigation (`expense/createExpense.ts`, `expense/updateExpense.ts`, `chat/migrateChat.ts`, `aws/createGroupReminderSchedule.ts`, etc.). Each becomes:

```ts
// before
console.error("Failed to create group reminder schedule:", error);
// after
ctx.log.error({ err: error }, "schedule.create.failed");
```

Non-error `console.log` calls (debug breadcrumbs like `"Start createSnapshotHandler"`) stay as-is for this PR. We don't need to police them now; the goal is making errors visible.

### Component 5 — Bot wiring

`apps/bot/src/index.ts` (the Telegraf entry):

```ts
const log = createLogger("bot");
bot.use(async (ctx, next) => {
  ctx.log = log.child({
    request_id: crypto.randomUUID(),
    update_id: ctx.update.update_id,
    chat_id: ctx.chat?.id?.toString(),
    user_id: ctx.from?.id?.toString(),
  });
  ctx.log.info({ update_type: ctx.updateType }, "bot.update");
  await next();
});
bot.catch((err, ctx) => {
  (ctx as any).log?.error({ err }, "bot.update.unhandled");
});
```

Each Telegram update gets its own request id, plus chat/user/update context. Unhandled handler errors stop being silent.

### Component 6 — Reference id on the TMA error screen

Three-line change in `apps/web/src/routes/_tma/chat.tsx`. The error branch already reads `getUserDataError`. The shaped error from `errorFormatter` now includes `requestId`, so we render:

```tsx
<Caption className="text-muted-foreground">
  Reference: {getUserDataError?.data?.requestId ?? "unknown"}
</Caption>
```

The point: when a user reports the error, they (or the agent helping them) can read the reference back and pivot directly to the matching log line. This is what makes "tell me the full story" a 5-minute task instead of a half-day investigation.

### Component 7 — Agent access (MCP + Axiom Skills)

The piece that turns "tell me the full story" into a structured tool call instead of a shell escapade. Two pieces, both installed once per dev machine, no per-repo wrappers.

1. **Axiom MCP server** — `https://mcp.axiom.co/mcp`. Remote server, two auth paths against the same endpoint:

   **Headless (recommended — works over SSH, in CI, on a fresh agent runner with no browser):**

   ```sh
   claude mcp add --transport http axiom https://mcp.axiom.co/mcp \
     --header "Authorization: Bearer $AXIOM_TOKEN" \
     --header "x-axiom-org-id: $AXIOM_ORG_ID"
   ```

   `AXIOM_TOKEN` + `AXIOM_ORG_ID` live in `.envrc` (already the convention for `VERCEL_TOKEN`, `SUPABASE_TOKEN`). `.envrc.example` gets matching placeholder lines.

   **OAuth (alternative — Claude Desktop, or local dev where the browser is handy):**

   ```sh
   claude mcp add --transport http axiom https://mcp.axiom.co/mcp
   ```

   First call triggers the browser OAuth flow; the agent never handles tokens after that. Either path surfaces the same tools:

   - `mcp__axiom__queryApl` — run an APL query, returns structured JSON
   - `mcp__axiom__listDatasets` — discover datasets
   - `mcp__axiom__getDatasetSchema` — surface field names + types
   - `mcp__axiom__getMonitors`, `mcp__axiom__getMonitorsHistory` — alert state
   - Dashboard ops (`createDashboard`, etc.) for ad-hoc visualizations

2. **Axiom Skills** — investigation methodology that loads on demand. Install once per machine:

   ```sh
   npx skills add axiomhq/skills
   ```

   Six skills get added. The two relevant ones for this codebase:

   - **System Reliability Engineering (SRE)** — hypothesis-driven incident investigation. Knows how to walk from a symptom to a root cause using APL. The agent invokes it when a production issue is reported, before reaching for queries blindly.
   - **Control costs** — query optimization patterns. Useful as the dataset grows.

   Skills config lives in `~/.axiom.toml` (per-machine, not per-repo). `AGENTS.md` documents the install + the path to the config file but never the token value.

3. **`AGENTS.md` "Production observability" section.** Documents:

   - How to add the MCP server (the `claude mcp add` line above)
   - How to install the skills (the `npx skills add` line above)
   - The relevant tools (`mcp__axiom__queryApl` etc.) and when to reach for which skill
   - 4–5 canonical APL templates the agent can paste into `queryApl`, e.g.
     ```apl
     ['$AXIOM_DATASET']
     | where ['service'] == "lambda"
     | where ['request_id'] == "{{REQUEST_ID}}"
     | sort by _time asc
     ```

The full investigation flow next time:

1. User pastes the reference id from the error screen.
2. Agent invokes the Axiom SRE skill for methodology + calls `mcp__axiom__queryApl` with the canonical request-timeline template.
3. Result includes the underlying `err.type` (e.g. `ExpiredError`) and message, with request-bound context.
4. Agent proposes the targeted fix.

No fallback shell script. No CLI install. The headless path uses `AXIOM_TOKEN` + `AXIOM_ORG_ID` from `.envrc`; the same token gets copied once to `~/.axiom.toml` for Axiom Skills.

## Log schema

Every line is a JSON object on stdout. Pino takes care of the format.

| Field            | Required           | Example                  | Notes                                              |
|------------------|--------------------|--------------------------|----------------------------------------------------|
| `time`           | yes                | `1714707120123`          | epoch ms, set by pino                              |
| `level`          | yes                | `30` info / `40` warn / `50` error | pino numeric levels                        |
| `msg`            | yes                | `"req.end"`              | event name, dot-separated, not a sentence          |
| `service`        | yes                | `"lambda"` / `"bot"`     | which app emitted the line                         |
| `request_id`     | when in a request  | `"01HXY2A…"`             | UUID set by Express or Telegraf middleware         |
| `procedure`      | tRPC events        | `"user.getUser"`         | populated via `ctx.log` and `errorFormatter`       |
| `user_id`        | when known         | `"522695573"`            | string to dodge BigInt JSON pain                   |
| `chat_id`        | when known         | `"-1003669938174"`       | string                                             |
| `auth_type`      | when authed        | `"telegram"`             | from auth middleware                               |
| `update_type`    | bot only           | `"message"`              | Telegraf update type                               |
| `update_id`      | bot only           | `12345`                  | Telegram update id                                 |
| `err.type`       | error events       | `"ExpiredError"`         | `pino.stdSerializers.err` (`type` = constructor)   |
| `err.message`    | error events       | `"Init data is expired"` |                                                    |
| `err.stack`      | error events       | trimmed string           |                                                    |
| `err.code`       | tRPC errors        | `"UNAUTHORIZED"`         | TRPCError code                                     |
| `duration_ms`    | `req.end`          | `142`                    | wall-clock                                         |
| `status`         | `req.end`          | `200`                    | HTTP status                                        |

Levels actually emitted in prod:

- **info** — request lifecycle (`req.start`, `req.end`), bot updates, normal flow events worth correlating
- **warn** — recoverable issues (rate limit hit, telegram send failure that's non-blocking, retry happening)
- **error** — every tRPC procedure error, every unhandled exception, every auth failure

## Alerting

Three Axiom monitors at launch. All notify via email and a webhook to the dev channel.

1. **Auth failures spike.** APL: filter `service = "lambda"`, `level = 50`, `msg = "auth.initData.failed"`. Alert if count > 20 / 5 min. Catches bot-token rotation gone wrong, Telegram client regressions, mass token expiry.
2. **Procedure error spike.** Filter `service = "lambda"`, `level = 50`, `err.code != "NOT_FOUND"`. Alert if count > 50 / 5 min. The general "something is broken" canary.
3. **Request p95 latency regression.** `service = "lambda"`, `msg = "req.end"`, `summarize p95 = percentile(duration_ms, 95) by bin_auto()`. Alert if `p95 > 2000ms` for 10 min. Catches Supabase slowness early.

## Rollout

One PR, three commits for review:

1. **`feat(logger): add @dko/logger package`** — package skeleton, pino config, AsyncLocalStorage-based request context, README pointing to `.envrc` for Axiom config.
2. **`feat(observability): instrument lambda + bot`** — Express middlewares, tRPC `errorFormatter` + `ctx.log`, auth-failure logging, mechanical replacement of ~30 `console.error` sites, bot Telegraf middleware, "Reference: <id>" line on the TMA error screen.
3. **`docs: production observability runbook`** — `AGENTS.md` section covering Axiom MCP install (headless + OAuth variants), Axiom Skills install, canonical APL templates, when to reach for which tool. `.envrc.example` updated with `AXIOM_TOKEN` + `AXIOM_ORG_ID` placeholders.

Per-machine setup, performed once by each developer / agent runner:

1. Generate an Axiom personal access token + note the org id from the Axiom UI.
2. Add to `.envrc` (export both vars), then `direnv allow`.
3. Run the headless `claude mcp add ... --header "Authorization: Bearer $AXIOM_TOKEN" --header "x-axiom-org-id: $AXIOM_ORG_ID"` (or the OAuth variant for desktop).
4. `npx skills add axiomhq/skills` and create `~/.axiom.toml` with the same token + org id.

Vercel side, performed once by the user after the PR merges:

1. Set `AXIOM_TOKEN` + `AXIOM_DATASET` on each project (`banana-split-tma-lambda`, `banana-split-tma-bot`) via Settings → Environment Variables (Production + Preview). The `@repo/logger` package ships logs directly via HTTP using the `@axiomhq/js` client — no Vercel marketplace integration or Log Drain required (Log Drains are Pro-only; this works on Hobby).
2. Configure the three monitors in the Axiom UI.

## Testing

- **Unit (logger package).** `getRequestId()` returns the value set by `withRequestContext` inside an awaited callback. Errors serialize with `err.type`, `err.message`, `err.stack`.
- **Integration (lambda).** A test that calls a procedure with a malformed `Authorization` header asserts the response includes `requestId` and a single `auth.initData.failed` line was emitted.
- **Integration (bot).** A telegraf update with a thrown handler error logs `bot.update.unhandled` exactly once.
- **Manual UAT (post-deploy).** Open the TMA. Trigger a known-auth-failure path (e.g. wipe initData and call the API directly). Confirm Axiom shows the structured event within 30 seconds. Take the reference id, call `mcp__axiom__queryApl` with the request-timeline template, confirm the full timeline (including `err.type` and `err.message`).

## Open questions

None at design time. The Axiom-via-Vercel-integration path is well-trodden, pino is the default for serverless Node, and the `ctx.log` pattern is standard tRPC.

## Out of scope (explicit)

- TMA web frontend client-side error capture — v2.
- CLI, admin, mcp, video-studio — non-user-facing.
- OpenTelemetry / spans / dashboards beyond the three starter monitors.
- Refactoring non-error `console.log` calls in tRPC procedures.
- Bumping the `validateInitData` expiry to 7 days — separate follow-up PR after this lands.
