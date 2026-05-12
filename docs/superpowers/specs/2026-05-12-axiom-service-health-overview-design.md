# Axiom dashboard — Service Health Overview

**Date:** 2026-05-12
**Status:** Design approved, ready for implementation plan
**Owner:** bubu (@bubuding0809)

## Context

We have one Axiom dataset (`bananasplitz`) collecting structured pino logs from `service: "bot" | "lambda"`. Only one dashboard exists today (`Group reminder reconciliation`, b5bf2ef2-…), and it covers the weekly self-healing cron only — not runtime observability for the rest of the system.

This spec defines a day-one **Service Health Overview** board: the dashboard you open first when something feels off, and the dashboard you glance at in the morning to confirm nothing broke overnight. It uses only fields the logger already emits — no new instrumentation.

## Goals

- Single board that reads cleanly at any time window (15m for triage, 24h for morning check, 7d for trend).
- Glanceable headline: 4 surface pills tell you in one second whether each major subsystem is healthy.
- Drill-down for "where do I look first" via top-erroring action and lambda-prefix breakdown panels.
- Zero new logging — works against the existing schema.

## Non-goals (deliberately deferred)

- Group-reminder *runtime* board (send funnel, send_ms p95, pin failure rate, Telegram error codes). Distinct board, future work.
- Per-procedure tRPC latency drill-down.
- Deploy annotation overlays (requires emitting deploy events from `.github/workflows/deploy.yml`).
- Axiom Monitor alerting wired to the pills.
- p95 latency panels. Latency is noisy at short windows and belongs on a dedicated performance board later.

## Surface derivation

Every chart computes a `surface` column via `extend`, used as the primary grouping dimension. Rules, in order:

| Match | Surface |
| --- | --- |
| `service == "bot"` and `msg startswith "agent."` | `agent` |
| `service == "bot"` (else) | `bot` |
| `service == "lambda"` and (`procedure != ""` or `msg startswith "trpc."`) | `trpc` |
| anything else (i.e. `service == "lambda"` rest) | `lambda` |

`lambda` is the catch-all so nothing gets dropped. Spot-check the distribution after the board is live — if a meaningful chunk lands in `lambda` that should be `trpc` or `agent`, refine the rules.

**Field-semantics note:** in this dataset the *event name* (what an engineer might call the "action") lives in pino's `msg` field, not the literal `action` field. The `action` field is reserved for user-supplied Telegram input (commands like `/list`, button payloads like `list_period_current_month`, free-text replies). Every chart in this spec uses `msg`. The `agent` codepath runs inside the bot service (it's the LLM tool-call loop triggered by Telegram messages), not in the lambda — hence the `service == "bot"` qualifier on the agent rule.

APL snippet, reused everywhere:

```kusto
| extend surface = case(
    service == "bot" and msg startswith "agent.", "agent",
    service == "bot", "bot",
    service == "lambda" and (isnotempty(procedure) or msg startswith "trpc."), "trpc",
    "lambda"
  )
```

## Layout

12-column grid. Default time window: last 24h. Refresh: 60s. Four rows total.

### Row 1 — Headline strip (h=3)

Eight Statistic charts, two per surface (error-rate pill + traffic-delta pill).

**Per-surface error-rate pill** (4×, w=2 each)

```kusto
['bananasplitz']
| extend surface = case(
    service == "bot" and msg startswith "agent.", "agent",
    service == "bot", "bot",
    service == "lambda" and (isnotempty(procedure) or msg startswith "trpc."), "trpc",
    "lambda"
  )
| where surface == "bot"   // one per surface: bot | lambda | trpc | agent
| summarize total = count(), errors = countif(level >= 50)
| extend rate = iff(total == 0, 0.0, 100.0 * errors / toreal(total))
| project rate
```

Threshold rules: green `< 1`, yellow `>= 1`, red `>= 5`. Display as `XX.X%`. Empty window shows `0.0%`.

**Per-surface traffic-delta pill** (4×, w=1 each, compact)

Axiom dashboards bind the chart query to the dashboard time-range automatically, so `cur` is unfiltered on `_time` and gets the current window applied by the dashboard runtime. `prev` hard-codes the 24h slice ending 7d ago — accurate when the dashboard window is 24h (the default). At other windows the comparison degrades but still gives a signal.

```kusto
let cur = ['bananasplitz']
  | extend surface = case(
      service == "bot" and msg startswith "agent.", "agent",
      service == "bot", "bot",
      service == "lambda" and (isnotempty(procedure) or msg startswith "trpc."), "trpc",
      "lambda"
    )
  | where surface == "bot"
  | summarize n = count();
let prev = ['bananasplitz']
  | where _time between (ago(8d) .. ago(7d))
  | extend surface = case(
      service == "bot" and msg startswith "agent.", "agent",
      service == "bot", "bot",
      service == "lambda" and (isnotempty(procedure) or msg startswith "trpc."), "trpc",
      "lambda"
    )
  | where surface == "bot"
  | summarize n = count();
cur
| extend prev_n = toscalar(prev)
| extend delta_pct = iff(prev_n == 0, real(null), 100.0 * (n - prev_n) / toreal(prev_n))
| project delta_pct
```

Threshold rules: green within ±25, yellow ±25–50, red `> ±50`. Null (no prior traffic) displays as `—`.

### Row 2 — Time-series (h=5)

**Volume by surface** (left, w=6, stacked area)

```kusto
['bananasplitz']
| extend surface = case(
    service == "bot" and msg startswith "agent.", "agent",
    service == "bot", "bot",
    service == "lambda" and (isnotempty(procedure) or msg startswith "trpc."), "trpc",
    "lambda"
  )
| summarize count() by bin_auto(_time), surface
```

**Error rate by surface** (right, w=6, multi-line)

```kusto
['bananasplitz']
| extend surface = case(
    service == "bot" and msg startswith "agent.", "agent",
    service == "bot", "bot",
    service == "lambda" and (isnotempty(procedure) or msg startswith "trpc."), "trpc",
    "lambda"
  )
| summarize total = count(), errors = countif(level >= 50) by bin_auto(_time), surface
| extend rate = iff(total == 0, 0.0, 100.0 * errors / toreal(total))
| project _time, surface, rate
```

### Row 3 — Top-N breakdowns (h=5)

**Top erroring events** (left, w=6, table or bar by count)

```kusto
['bananasplitz']
| where level >= 50 and isnotempty(msg)
| summarize count() by msg
| top 10 by count_
```

**Lambda msg-prefix breakdown over time** (right, w=6, stacked bar). HTTP plumbing (`auth.*`, `req.*`) excluded so the chart highlights real codepath activity.

```kusto
['bananasplitz']
| where service == "lambda" and isnotempty(msg)
| extend prefix = case(
    msg startswith "auth.", "auth",
    msg startswith "req.", "req",
    msg startswith "trpc.", "trpc",
    msg startswith "reconciliation.", "reconciliation",
    msg startswith "telegram.", "telegram",
    "other"
  )
| where prefix !in ("auth", "req")
| summarize count() by bin_auto(_time), prefix
```

### Row 4 — Fatal log tail (h=8, w=12)

LogStream chart.

```kusto
['bananasplitz']
| extend surface = case(
    service == "bot" and msg startswith "agent.", "agent",
    service == "bot", "bot",
    service == "lambda" and (isnotempty(procedure) or msg startswith "trpc."), "trpc",
    "lambda"
  )
| where level >= 50
| project _time, surface, msg, ['err.message'], chat_id, request_id, ['err.code']
| sort by _time desc
| take 100
```

## Edge cases

- **Empty window** — every Statistic chart uses `iff(total == 0, 0, …)` to avoid NaN.
- **No prior traffic for delta** — display `—`, not `Infinity`. Achieved via `iff(prev_n == 0, real(null), …)` plus a chart-level null formatter.
- **Surface miscategorization** — `lambda` is the catch-all bucket. After the board is live, run a one-off query to inspect the distribution of `action` values within `surface == "lambda"`; if material categories are mislabeled, extend the `case` rules.
- **`bin_auto`** — chosen over fixed bins so the same panels read well at 15m, 24h, and 7d.
- **`procedure` field** — used as a `surface = "trpc"` signal. Confirm via a one-off probe that this field is only set on tRPC events.

## Testing

Manual verification after creation:

1. Open the board with default 24h window. Confirm all panels render with non-empty results (assuming there's been any traffic).
2. For each surface, run an ad-hoc APL query in the explorer that sums total + errors and compare against the pill. Should match exactly.
3. Sum the `count()` values across all 4 surfaces in the volume chart and compare to a `count()` query without the `extend`. Should match — no double-counting.
4. Switch the time-range to 15m and confirm panels still render (smaller numbers, but no broken charts).
5. Switch to 7d and confirm `bin_auto` produces sensible bucketing.
6. Pick a known recent error window and confirm:
   - The relevant pill turns yellow/red.
   - The error shows in the fatal tail.
   - The top-actions bar reflects it.

## Implementation notes

- Use `mcp__axiom__createDashboard` to provision. Schema follows the existing reconciliation board (charts array + layout array).
- All chart APL is self-contained — no saved-query dependencies.
- Refresh time `60s`, time window `qr-now-24h` … `qr-now` for the default.
- Dashboard name: `Service health overview`. Description: short — "Day-one operational view: per-surface error rate, traffic delta, top errors. See 2026-05-12 spec."
- The `extend surface = case(...)` block is repeated across 7 charts. Acceptable duplication for day-one; can be promoted to a saved query later if rules churn.

## Future extensions

Once this is in use and the team confirms it's the right shape, add:

- Group-reminder runtime board (sends/failures/send_ms/pin failures/heatmap of fires).
- Deploy markers — emit a `deploy.complete` event from `.github/workflows/deploy.yml` and overlay vertical lines on the time-series.
- Axiom Monitors firing on pill thresholds (e.g. error-rate red for >5m → Telegram alert).
- Per-procedure tRPC drill-down board.
- p95 / p99 latency board.

## Build notes (2026-05-12)

- **Dashboard UID:** `cf6d7568-a152-4aa1-8ee1-57ecfc4ee04c`
- **Dashboard short ID:** `Kg7QuBMxJjH2cSnLHD`
- **Owner:** `X-AXIOM-EVERYONE` (visible to all org members)
- **Refresh:** 60s · **Default window:** 24h
- **Created via:** `mcp__axiom__createDashboard` on 2026-05-12

### Pre-flight probe findings (Task 1)

1. `service` field holds only `bot` and `lambda` (no other values seen in 7d). 2,583 bot / 11,514 lambda events.
2. **The "action" name lives in `msg`, not `action`.** The literal `action` field carries user-supplied Telegram input — `/list`, `LOL`, button payloads. The pino `msg` parameter (e.g. `agent.group.final.edit.failed`, `trpc.procedure.error`) is the engineering event name. All charts use `msg`.
3. **`agent.*` events run on the bot service, not the lambda.** The agent is the LLM tool-call loop inside the Telegram handler, not a separate lambda. Surface rule: `service == "bot" AND msg startswith "agent."`.
4. **`procedure` is set on bot too** (222 events) — bot calling internal tRPC during command handling. The `trpc` surface stays narrow (lambda-side only) so the bot's internal tRPC stays in the `bot` surface, matching the deploy-unit triage model.
5. **Lambda catch-all is dominated by `auth.*` (TMA initData) and `req.*` (HTTP plumbing).** The `Lambda msg-prefix` chart filters these out so real codepath activity (reconciliation, telegram sends, schedule attempts) is visible.

### Smoke test (Task 6)

| Check | Result |
| --- | --- |
| Surface sums equal total (24h) | 523 + 266 + 30 + 3 = 822 = total |
| Catch-all `lambda` surface sensible | auth/req noise + reconciliation/telegram/schedule events |
| Dashboard fetched back with 13 charts | all charts and layout match payload |
| Agent error rate signal present (7d) | 10.64% (5/47) — would render red |

### Traffic-delta caveat

The `Δ7d` pills compare the dashboard's current window (auto-applied by Axiom) against a fixed 24h slice ending 7d ago. Accurate when the window is 24h (the default). At 15m or 7d the comparison degrades to "current window vs the 24h slot 7d ago" — still a signal but mislabeled. Revisit if we change the default window.

### Threshold rules

The spec calls for color thresholds on pills (green/yellow/red). The Axiom MCP `createDashboard` schema doesn't expose a `thresholds` field on Statistic charts, so colors must be configured manually in the Axiom UI per chart. Day-one acceptable since the numeric values are clear; revisit if we add Monitors that need the same thresholds machine-readable.
