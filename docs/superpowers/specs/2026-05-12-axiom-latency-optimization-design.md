# Axiom dashboard — Latency Optimization Hunt

**Date:** 2026-05-12
**Status:** Design approved, ready for implementation plan
**Owner:** bubu (@bubuding0809)

## Context

The Service Health Overview board (`cf6d7568-…`) covers error rate and traffic. It doesn't surface *which codepaths are slow*. This spec defines a complementary dashboard whose job is to answer one question: "if I had an hour to make something faster, what should I work on?"

The board uses fields already populated by the existing pino logger — `duration_ms`, `latency_ms`, `path`, `procedure`, `tool`. No new instrumentation.

## Goals

- One screen ranks codepaths by tail latency (p95 / p99) so the highest-impact targets jump out.
- HTTP routes and tRPC procedures get their own drill-down panels so `req.end` doesn't lump into one bucket.
- Agent internals (tool calls, LLM TTFB) get a dedicated section since the agent is the largest expected single source of UX-felt slowness.
- A small time-series catches "did I actually make it faster after the deploy".
- Zero new logging.

## Non-goals (deliberately deferred)

- Regression alerting / Axiom Monitors on p95 movement.
- SLO budgets and green/red coloring per codepath. (No baseline to set them against yet.)
- Aggregate "total wall time" leaderboard (count × avg). Useful but separate optimization question; keep this board focused on tail-latency optimization.
- Latency heatmaps. Better than line charts for distribution shifts, but a v2 feature.
- Deploy annotations.

## Field coverage (verified 2026-05-12 over 7d)

| Field | Events | Notes |
| --- | --- | --- |
| `duration_ms` | 4,200 | Primary signal. Populated on every `*.end` log: `req.end`, `bot.update.end`, `trpc.call.end`, `expense.create.end`, `agent.run.end`, `agent.tool.end`, and others. |
| `latency_ms` | 10 | Only `agent.llm.first_chunk` — time-to-first-chunk for LLM streaming. |
| `send_ms` | 19 | Only `expense.list.end` — message-send duration carved out. Not used in v1. |
| `format_duration_ms` | 26 | Not used in v1. |
| `path` | populated on `req.end` (2,496 events) | Drives the HTTP route drill-down. Note batched-tRPC paths appear as comma-joined lists. |
| `procedure` | populated on `trpc.call.end` (111 events); empty on `trpc.internal.timing` (428 events) | Drives the tRPC drill-down using `msg == "trpc.call.end"` only. |
| `tool` | populated on `agent.tool.end` (6 events) | Drives the agent-tools panel. Low volume, so percentiles are jittery; useful directionally. |

## Surface (re-used from health board)

This board does not split by surface in the headline leaderboards — slowness ranking is the same question regardless of which service emits the event. The shared `extend surface = case(...)` is *not* applied here; we filter directly on `msg` / `path` / `procedure` / `tool`.

## Layout

12-column grid. Default time window: last 24h. Refresh: 60s. Four sections, top to bottom.

### Section 1 — Headline leaderboards (h=8)

**Left (w=6) — Top 10 slowest msg by p95**

Table. Columns: `msg`, `count`, `p50_ms`, `p95_ms`, `p99_ms`. Sorted by `p95_ms` desc. `count >= 5` filter so a single outlier doesn't dominate.

```kusto
['bananasplitz']
| where isnotnull(duration_ms) and isnotempty(msg)
| summarize
    count = count(),
    p50_ms = percentile(duration_ms, 50),
    p95_ms = percentile(duration_ms, 95),
    p99_ms = percentile(duration_ms, 99)
    by msg
| where count >= 5
| top 10 by p95_ms desc
```

**Right (w=6) — Top 10 slowest msg by p99**

Same shape, ordered by `p99_ms desc`. Catches tails the p95 panel hides.

```kusto
['bananasplitz']
| where isnotnull(duration_ms) and isnotempty(msg)
| summarize
    count = count(),
    p50_ms = percentile(duration_ms, 50),
    p95_ms = percentile(duration_ms, 95),
    p99_ms = percentile(duration_ms, 99)
    by msg
| where count >= 5
| top 10 by p99_ms desc
```

### Section 2 — HTTP / tRPC drill-downs (h=6)

**Left (w=6) — Slowest HTTP routes**

Table grouped by `path` over `req.end` events. Reveals which API routes need work (e.g. `/chat.getChat` vs `/category.suggest`).

```kusto
['bananasplitz']
| where msg == "req.end" and isnotnull(duration_ms) and isnotempty(path)
| summarize
    count = count(),
    p50_ms = percentile(duration_ms, 50),
    p95_ms = percentile(duration_ms, 95),
    p99_ms = percentile(duration_ms, 99)
    by path
| where count >= 5
| top 10 by p95_ms desc
```

Note: batched tRPC requests appear as comma-joined paths (e.g. `/expense.getExpenseDetails,telegram.getChatMember,currency.getSupportedCurrencies`) and bucket as their own row. That's correct — batched calls have different perf characteristics than individual ones.

**Right (w=6) — Slowest tRPC procedures**

Table grouped by `procedure` over `trpc.call.end` events. `trpc.internal.timing` is excluded because its `procedure` field is empty (428 events with no tag — future work to fix the log line).

```kusto
['bananasplitz']
| where msg == "trpc.call.end" and isnotnull(duration_ms) and isnotempty(procedure)
| summarize
    count = count(),
    p50_ms = percentile(duration_ms, 50),
    p95_ms = percentile(duration_ms, 95),
    p99_ms = percentile(duration_ms, 99)
    by procedure
| where count >= 5
| top 10 by p95_ms desc
```

### Section 3 — Agent internals (h=6)

**Left (w=6) — Slowest agent tools**

Table grouped by `tool` over `agent.tool.end`. Low-volume currently (6 events / 7d), so numbers are directional, not statistical.

```kusto
['bananasplitz']
| where msg == "agent.tool.end" and isnotnull(duration_ms) and isnotempty(tool)
| summarize
    count = count(),
    p50_ms = percentile(duration_ms, 50),
    p95_ms = percentile(duration_ms, 95),
    p99_ms = percentile(duration_ms, 99)
    by tool
| top 10 by p95_ms desc
```

No `count >= 5` filter here — agent-tool data is sparse enough that filtering would empty the panel. Read with the volume column in mind.

**Right (w=6) — LLM time-to-first-chunk**

Single statistic. p95 of `latency_ms` on `agent.llm.first_chunk`. The user-felt "is the AI responding quickly" metric.

```kusto
['bananasplitz']
| where msg == "agent.llm.first_chunk" and isnotnull(latency_ms)
| summarize p95_ms = percentile(latency_ms, 95)
```

### Section 4 — p95 over time (h=6, w=12)

**Top-5 msg p95 over time**

Multi-line. Plots p95 over `bin_auto(_time)` for the top 5 msg values from Section 1's p95 leaderboard. Catches optimization wins ("p95 dropped after deploy") and regressions.

Implementation note: APL doesn't have a clean "top 5 from inner query then time-series outer" pattern at dashboard chart level. The dashboard chart hard-codes the top-5 msg list selected from a manual 7-day inspection at build time; the build notes record which 5 were picked and when to refresh the list. Worst case it's a 30-second manual edit every couple of weeks.

```kusto
['bananasplitz']
| where isnotnull(duration_ms) and msg in (
    "<msg-1>", "<msg-2>", "<msg-3>", "<msg-4>", "<msg-5>"
  )
| summarize p95_ms = percentile(duration_ms, 95) by bin_auto(_time), msg
```

The build-time top-5 list will be captured in the spec's Build notes section after the dashboard is created.

## Edge cases

- **Small windows / few samples** — leaderboards filter `count >= 5` (except agent tools). At a 15m window the panels may be near-empty. That's correct — you shouldn't make optimization decisions from 3 data points.
- **`trpc.internal.timing` missing `procedure`** — excluded from drill-down, noted as future fix.
- **Batched tRPC paths** — bucket as comma-joined paths. Acceptable; different perf profile from individual calls.
- **Agent tools volume is tiny** — directional only until traffic grows.
- **Hard-coded top-5 in Section 4** — list will drift; refresh during quarterly review or when leaderboards rank changes meaningfully.

## Testing

After creation:
1. Open at 24h, confirm all panels render.
2. Run each leaderboard APL standalone in the explorer; ordering matches the dashboard.
3. Spot-check one HTTP path's p95 against an ad-hoc query.
4. Verify Section 4 shows lines for the 5 codepaths named in the chart APL (manual; will be empty until those msg values appear in the window).
5. Switch window to 7d and confirm panels read well at a wider zoom.

## Implementation notes

- Use `mcp__axiom__createDashboard`. Schema mirrors the health board: `charts[]` + `layout[]`, `refreshTime: 60`, `schemaVersion: 2`, `timeWindowStart: "qr-now-24h"`, `timeWindowEnd: "qr-now"`, `owner: "X-AXIOM-EVERYONE"`.
- Chart types: 7× `Table`, 1× `Statistic`, 1× `TimeSeries`.
- Pick the build-time top-5 msg list **after** Section 1's leaderboard is run live; record in Build notes.

## Future extensions

- SLO budgets + green/red colors once we have baselines.
- Aggregate-time-spent leaderboard (count × avg) — second optimization lens.
- Latency heatmaps for the top 3 codepaths (better than line charts for distribution shifts).
- Fix the `trpc.internal.timing` log line to populate `procedure`.
- Axiom Monitors firing on p95 regression (e.g. `agent.run.end` p95 doubles vs trailing 7d).
- Deploy annotations on Section 4.

## Build notes (2026-05-12)

- **Dashboard UID:** `50189c25-5a21-4d91-b329-bb05077ba3a1`
- **Dashboard short ID:** `XndBaUat6rbE7lcvfq`
- **Dashboard URL:** https://app.axiom.co/bananasplitz-vlrx/dashboards/XndBaUat6rbE7lcvfq
- **Owner:** `X-AXIOM-EVERYONE`
- **Refresh:** 60s · **Default window:** 24h
- **Created via:** `mcp__axiom__createDashboard` on 2026-05-12

### Section 4 top-5 msg list (picked at build time)

From the 7d p95 leaderboard. Refresh when rankings shift meaningfully (~quarterly review).

| # | msg | p95 (ms) | events (7d) |
| --- | --- | --- | --- |
| 1 | `agent.run.end` | 27,224 | 10 |
| 2 | `agent.tool.end` | 9,244 | 6 |
| 3 | `expense.create.end` | 3,320 | 14 |
| 4 | `expense.list.end` | 3,063 | 19 |
| 5 | `stats.fetch.end` | 2,790 | 6 |

### Headline findings at build time

The dashboard surfaces real optimization targets immediately:

- **Agent loop is the dominant slow path** — `agent.run.end` p95 = **27.2s**, end-user wait time for AI-handled messages.
- **LLM time-to-first-chunk = 14.1s p95** — half of agent.run.end is just waiting for the first LLM token. Cuts here flow directly into agent.run.end.
- **`createExpenseTool` p95 = 9.2s** — by far the slowest agent tool (3 events). Likely opportunity to parallelize internal tRPC calls or trim LLM-side reasoning.
- **`expense.getAllExpensesByChat` p95 = 2.5s** for the tRPC procedure — slow read in the expense flow.
- **HTTP top-paths are mostly Telegram webhook delivery to specific chat IDs** (`/-1001395831833` etc.). Not actionable — these are webhook-framework routes. Telegram group-reminder send sits at 1.3s p95 (218 events) — actionable.

### Smoke test

| Check | Result |
| --- | --- |
| 7 charts in dashboard | ✅ |
| Round-trip APL clean | ✅ |
| Each panel matches probe queries (Task 1) | ✅ — leaderboard ordering identical |
| Top-5 hardcoded list matches Section 1 ranking | ✅ |
| LLM TTFB stat returns finite number | ✅ 14,144 ms |

### Known caveats

- LLM TTFB has very low volume (10 events / 7d). The stat reads `—` at short windows.
- Agent tools panel is directional only at current traffic levels (3-6 events per tool).
- Section 4 msg list is static — refresh when leaderboard rankings shift, or once a quarter.
- `trpc.internal.timing` excluded from the procedure drill-down (`procedure` field empty on 428 events; future fix to the log line).
