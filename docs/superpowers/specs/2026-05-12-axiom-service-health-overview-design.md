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
| `service == "bot"` | `bot` |
| `service == "lambda"` and `action startswith "agent."` | `agent` |
| `service == "lambda"` and (`procedure != ""` or `action == "trpc.call.start"`) | `trpc` |
| anything else | `lambda` |

`lambda` is the catch-all so nothing gets dropped. Spot-check the distribution after the board is live — if a meaningful chunk lands in `lambda` that should be `trpc` or `agent`, refine the rules.

APL snippet, reused everywhere:

```kusto
| extend surface = case(
    service == "bot", "bot",
    service == "lambda" and action startswith "agent.", "agent",
    service == "lambda" and (isnotempty(procedure) or action == "trpc.call.start"), "trpc",
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
| extend surface = case(...)
| where surface == "bot"   // one per surface
| summarize total = count(), errors = countif(level >= 50)
| extend rate = iff(total == 0, 0.0, 100.0 * errors / total)
| project rate
```

Threshold rules: green `< 1`, yellow `>= 1`, red `>= 5`. Display as `XX.X%`. Empty window shows `0.0%`.

**Per-surface traffic-delta pill** (4×, w=1 each, compact)

```kusto
let cur = ['bananasplitz']
  | extend surface = case(...)
  | where surface == "bot"
  | summarize n = count();
let prev = ['bananasplitz']
  | extend surface = case(...)
  | where surface == "bot"
  | where _time between (ago(7d + <window>) .. ago(7d))
  | summarize n = count();
cur | extend prev_n = toscalar(prev)
   | extend delta_pct = iff(prev_n == 0, real(null), 100.0 * (n - prev_n) / prev_n)
   | project delta_pct
```

`<window>` is bound to the dashboard's selected range — Axiom expands this via `$__interval` / time-range variable; final APL adjusted at build time. Threshold rules: green within ±25, yellow ±25–50, red `> ±50`. Null (no prior traffic) displays as `—`.

### Row 2 — Time-series (h=5)

**Volume by surface** (left, w=6, stacked area)

```kusto
['bananasplitz']
| extend surface = case(...)
| summarize count() by bin_auto(_time), surface
```

**Error rate by surface** (right, w=6, multi-line)

```kusto
['bananasplitz']
| extend surface = case(...)
| summarize total = count(), errors = countif(level >= 50) by bin_auto(_time), surface
| extend rate = iff(total == 0, 0.0, 100.0 * errors / total)
| project _time, surface, rate
```

### Row 3 — Top-N breakdowns (h=5)

**Top erroring actions** (left, w=6, horizontal bar)

```kusto
['bananasplitz']
| where level >= 50 and isnotempty(action)
| summarize count() by action
| top 10 by count_
```

**Lambda action-prefix breakdown over time** (right, w=6, stacked bar)

```kusto
['bananasplitz']
| where service == "lambda" and isnotempty(action)
| extend prefix = case(
    action startswith "agent.", "agent",
    action startswith "expense.", "expense",
    action startswith "group.", "group",
    action startswith "reconciliation.", "reconciliation",
    "other"
  )
| summarize count() by bin_auto(_time), prefix
```

### Row 4 — Fatal log tail (h=8, w=12)

LogStream chart.

```kusto
['bananasplitz']
| extend surface = case(...)
| where level >= 50
| project _time, surface, action, ['err.message'], chat_id, request_id, ['err.code']
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
