# Axiom Service Health Overview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `Service health overview` Axiom dashboard against the `bananasplitz` dataset, exactly as specified in `docs/superpowers/specs/2026-05-12-axiom-service-health-overview-design.md`.

**Architecture:** No application code. Work is entirely Axiom MCP calls: probe assumptions → assemble dashboard JSON payload → create via `mcp__axiom__createDashboard` → verify panels live. Surface derivation is repeated inline in each chart's APL.

**Tech Stack:** Axiom Processing Language (APL), Axiom MCP tools (`mcp__axiom__queryDataset`, `mcp__axiom__createDashboard`, `mcp__axiom__getDashboard`, `mcp__axiom__updateDashboard`).

---

## File structure

This plan creates an Axiom resource, not source files. The only repo touchpoint is appending a "Build notes" section to the spec if surface rules need refining post-launch.

- **Modify (optional, only if probes reveal mis-categorization):** `docs/superpowers/specs/2026-05-12-axiom-service-health-overview-design.md` — append a "Build notes" section noting any rule adjustments.
- **External resource created:** Axiom dashboard `Service health overview`.

---

## Task 1: Pre-flight assumption probes

Before building, verify the three assumptions the spec rests on. Each probe is a single APL query via `mcp__axiom__queryDataset` over the last 7d.

**Files:** none

- [ ] **Step 1: Probe — `service` field distribution**

Run via `mcp__axiom__queryDataset` with `startTime: "now-7d"`:

```kusto
['bananasplitz']
| summarize count() by service
| top 10 by count_
```

Expected: rows for `bot` and `lambda` only. If any other value appears with non-trivial volume, note it — the surface `case` may need an extra rule. Record the result.

- [ ] **Step 2: Probe — `procedure` field is tRPC-only**

```kusto
['bananasplitz']
| where isnotempty(procedure)
| summarize count() by service, bin_auto(_time)
| take 50
```

Expected: every row has `service == "lambda"` (tRPC routes run inside the lambda). If `service == "bot"` ever has `procedure` set, the surface rule needs to handle that. Record the result.

- [ ] **Step 3: Probe — error events actually exist**

```kusto
['bananasplitz']
| where level >= 50
| summarize count() by service, action
| top 20 by count_
```

Expected: a populated table. If empty, the dashboard will render with all-green pills — fine, but record so the smoke test in Task 6 knows there's no baseline error to anchor on.

- [ ] **Step 4: Probe — lambda action-prefix coverage**

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
| summarize count() by prefix
| top 10 by count_
```

Expected: the four named prefixes plus `other`. If `other` dominates, identify the top actions inside it and decide whether to add a prefix bucket before building.

- [ ] **Step 5: Commit probe findings (if any rule adjustments are needed)**

If steps 1–4 surface anything that warrants changing the surface or prefix rules, edit `docs/superpowers/specs/2026-05-12-axiom-service-health-overview-design.md` to update the rules table and the `case` expressions, then:

```bash
git add docs/superpowers/specs/2026-05-12-axiom-service-health-overview-design.md
git commit -m "docs: refine surface rules after pre-flight probes"
```

If no adjustments are needed, skip this step.

---

## Task 2: Build & verify each chart's APL standalone

Before bundling into a dashboard, run each chart's exact APL via `mcp__axiom__queryDataset` and confirm it returns a sensible shape. This catches typos and field-name mistakes before the createDashboard call.

**Files:** none

- [ ] **Step 1: Verify error-rate pill APL (bot surface)**

Run with `startTime: "now-24h"`:

```kusto
['bananasplitz']
| extend surface = case(
    service == "bot", "bot",
    service == "lambda" and action startswith "agent.", "agent",
    service == "lambda" and (isnotempty(procedure) or action == "trpc.call.start"), "trpc",
    "lambda"
  )
| where surface == "bot"
| summarize total = count(), errors = countif(level >= 50)
| extend rate = iff(total == 0, 0.0, 100.0 * errors / total)
| project rate
```

Expected: one row, one column `rate`, value in `[0, 100]`. Record the number.

- [ ] **Step 2: Repeat the pill APL for the other 3 surfaces**

Run the same query 3 more times, swapping `surface == "bot"` for `"lambda"`, `"trpc"`, `"agent"`. Record each rate. The four rates together are the baseline for the dashboard's headline pills.

- [ ] **Step 3: Verify traffic-delta APL (bot surface)**

The default dashboard window is 24h, so compare current 24h vs the 24h window starting 7d ago.

```kusto
let cur = ['bananasplitz']
  | where _time > ago(24h)
  | extend surface = case(
      service == "bot", "bot",
      service == "lambda" and action startswith "agent.", "agent",
      service == "lambda" and (isnotempty(procedure) or action == "trpc.call.start"), "trpc",
      "lambda"
    )
  | where surface == "bot"
  | summarize n = count();
let prev = ['bananasplitz']
  | where _time between (ago(8d) .. ago(7d))
  | extend surface = case(
      service == "bot", "bot",
      service == "lambda" and action startswith "agent.", "agent",
      service == "lambda" and (isnotempty(procedure) or action == "trpc.call.start"), "trpc",
      "lambda"
    )
  | where surface == "bot"
  | summarize n = count();
cur
| extend prev_n = toscalar(prev)
| extend delta_pct = iff(prev_n == 0, real(null), 100.0 * (n - prev_n) / toreal(prev_n))
| project delta_pct
```

Expected: one row, one column `delta_pct`, value is a real number or null. Record it. Repeat for the other 3 surfaces.

Note: Axiom dashboards bind the chart's "current" window to the dashboard time-range automatically. We hard-code `24h` here for the probe; the final chart APL drops the `where _time > ago(24h)` on `cur` (Axiom applies the dashboard range) but keeps the `between (ago(8d) .. ago(7d))` on `prev`. This asymmetry is the trick that makes "vs 7d ago for the *same* window length" work — but it only works correctly when the dashboard window is 24h. Document this in the Build notes at the end of Task 7.

- [ ] **Step 4: Verify volume-by-surface APL**

```kusto
['bananasplitz']
| extend surface = case(
    service == "bot", "bot",
    service == "lambda" and action startswith "agent.", "agent",
    service == "lambda" and (isnotempty(procedure) or action == "trpc.call.start"), "trpc",
    "lambda"
  )
| summarize count() by bin_auto(_time), surface
```

Expected: multiple rows, columns `_time`, `surface`, `count_`. Should contain all 4 surfaces (if there's been traffic for each in the last 24h).

- [ ] **Step 5: Verify error-rate-by-surface APL**

```kusto
['bananasplitz']
| extend surface = case(
    service == "bot", "bot",
    service == "lambda" and action startswith "agent.", "agent",
    service == "lambda" and (isnotempty(procedure) or action == "trpc.call.start"), "trpc",
    "lambda"
  )
| summarize total = count(), errors = countif(level >= 50) by bin_auto(_time), surface
| extend rate = iff(total == 0, 0.0, 100.0 * errors / toreal(total))
| project _time, surface, rate
```

Expected: rows with `_time`, `surface`, `rate` in `[0, 100]`.

- [ ] **Step 6: Verify top-erroring-actions APL**

```kusto
['bananasplitz']
| where level >= 50 and isnotempty(action)
| summarize count() by action
| top 10 by count_
```

Expected: up to 10 rows with `action`, `count_`.

- [ ] **Step 7: Verify lambda action-prefix APL**

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

Expected: rows with `_time`, `prefix`, `count_`.

- [ ] **Step 8: Verify fatal log tail APL**

```kusto
['bananasplitz']
| extend surface = case(
    service == "bot", "bot",
    service == "lambda" and action startswith "agent.", "agent",
    service == "lambda" and (isnotempty(procedure) or action == "trpc.call.start"), "trpc",
    "lambda"
  )
| where level >= 50
| project _time, surface, action, ['err.message'], chat_id, request_id, ['err.code']
| sort by _time desc
| take 100
```

Expected: up to 100 rows. If empty, the LogStream panel will render empty — acceptable.

---

## Task 3: Assemble dashboard payload

Build the full JSON payload that will be passed to `mcp__axiom__createDashboard`. The shape mirrors the existing reconciliation board (chart array + layout array). Schema reference: get the existing dashboard via `mcp__axiom__getDashboard` with uid `b5bf2ef2-a763-48f9-8ff5-1c23dc30549c` and copy the field structure.

**Files:** none (payload assembled in-context for the next task)

- [ ] **Step 1: Fetch reference dashboard schema**

Call `mcp__axiom__getDashboard` with `dashboardId: "b5bf2ef2-a763-48f9-8ff5-1c23dc30549c"`. Confirm the createDashboard input shape from the response: `name`, `description`, `refreshTime`, time window, `charts`, `layout`.

- [ ] **Step 2: Draft the `charts` array**

Construct an array with the following entries. Use `Statistic` for pills, `TimeSeries` for line/area, `Bar` (or `TimeSeries` with bar style — check Axiom MCP docs for the exact `type` string from the reference dashboard) for the top-N, `LogStream` for the tail.

```json
[
  {
    "id": "pill-bot-err",
    "name": "bot · error rate",
    "query": { "apl": "['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"bot\" | summarize total = count(), errors = countif(level >= 50) | extend rate = iff(total == 0, 0.0, 100.0 * errors / toreal(total)) | project rate" },
    "type": "Statistic"
  },
  {
    "id": "pill-lambda-err",
    "name": "lambda · error rate",
    "query": { "apl": "['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"lambda\" | summarize total = count(), errors = countif(level >= 50) | extend rate = iff(total == 0, 0.0, 100.0 * errors / toreal(total)) | project rate" },
    "type": "Statistic"
  },
  {
    "id": "pill-trpc-err",
    "name": "trpc · error rate",
    "query": { "apl": "['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"trpc\" | summarize total = count(), errors = countif(level >= 50) | extend rate = iff(total == 0, 0.0, 100.0 * errors / toreal(total)) | project rate" },
    "type": "Statistic"
  },
  {
    "id": "pill-agent-err",
    "name": "agent · error rate",
    "query": { "apl": "['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"agent\" | summarize total = count(), errors = countif(level >= 50) | extend rate = iff(total == 0, 0.0, 100.0 * errors / toreal(total)) | project rate" },
    "type": "Statistic"
  },
  {
    "id": "pill-bot-delta",
    "name": "bot · Δ7d",
    "query": { "apl": "let cur = ['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"bot\" | summarize n = count(); let prev = ['bananasplitz'] | where _time between (ago(8d) .. ago(7d)) | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"bot\" | summarize n = count(); cur | extend prev_n = toscalar(prev) | extend delta_pct = iff(prev_n == 0, real(null), 100.0 * (n - prev_n) / toreal(prev_n)) | project delta_pct" },
    "type": "Statistic"
  },
  {
    "id": "pill-lambda-delta",
    "name": "lambda · Δ7d",
    "query": { "apl": "let cur = ['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"lambda\" | summarize n = count(); let prev = ['bananasplitz'] | where _time between (ago(8d) .. ago(7d)) | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"lambda\" | summarize n = count(); cur | extend prev_n = toscalar(prev) | extend delta_pct = iff(prev_n == 0, real(null), 100.0 * (n - prev_n) / toreal(prev_n)) | project delta_pct" },
    "type": "Statistic"
  },
  {
    "id": "pill-trpc-delta",
    "name": "trpc · Δ7d",
    "query": { "apl": "let cur = ['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"trpc\" | summarize n = count(); let prev = ['bananasplitz'] | where _time between (ago(8d) .. ago(7d)) | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"trpc\" | summarize n = count(); cur | extend prev_n = toscalar(prev) | extend delta_pct = iff(prev_n == 0, real(null), 100.0 * (n - prev_n) / toreal(prev_n)) | project delta_pct" },
    "type": "Statistic"
  },
  {
    "id": "pill-agent-delta",
    "name": "agent · Δ7d",
    "query": { "apl": "let cur = ['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"agent\" | summarize n = count(); let prev = ['bananasplitz'] | where _time between (ago(8d) .. ago(7d)) | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where surface == \"agent\" | summarize n = count(); cur | extend prev_n = toscalar(prev) | extend delta_pct = iff(prev_n == 0, real(null), 100.0 * (n - prev_n) / toreal(prev_n)) | project delta_pct" },
    "type": "Statistic"
  },
  {
    "id": "ts-volume",
    "name": "Volume by surface",
    "query": { "apl": "['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | summarize count() by bin_auto(_time), surface" },
    "type": "TimeSeries"
  },
  {
    "id": "ts-error-rate",
    "name": "Error rate % by surface",
    "query": { "apl": "['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | summarize total = count(), errors = countif(level >= 50) by bin_auto(_time), surface | extend rate = iff(total == 0, 0.0, 100.0 * errors / toreal(total)) | project _time, surface, rate" },
    "type": "TimeSeries"
  },
  {
    "id": "bar-top-errors",
    "name": "Top erroring actions",
    "query": { "apl": "['bananasplitz'] | where level >= 50 and isnotempty(action) | summarize count() by action | top 10 by count_" },
    "type": "TimeSeries"
  },
  {
    "id": "bar-lambda-prefix",
    "name": "Lambda action-prefix over time",
    "query": { "apl": "['bananasplitz'] | where service == \"lambda\" and isnotempty(action) | extend prefix = case(action startswith \"agent.\", \"agent\", action startswith \"expense.\", \"expense\", action startswith \"group.\", \"group\", action startswith \"reconciliation.\", \"reconciliation\", \"other\") | summarize count() by bin_auto(_time), prefix" },
    "type": "TimeSeries"
  },
  {
    "id": "logs-fatal-tail",
    "name": "Fatal log tail",
    "query": { "apl": "['bananasplitz'] | extend surface = case(service == \"bot\", \"bot\", service == \"lambda\" and action startswith \"agent.\", \"agent\", service == \"lambda\" and (isnotempty(procedure) or action == \"trpc.call.start\"), \"trpc\", \"lambda\") | where level >= 50 | project _time, surface, action, ['err.message'], chat_id, request_id, ['err.code'] | sort by _time desc | take 100" },
    "type": "LogStream"
  }
]
```

Note: `Bar` may not be a separate chart type in this Axiom version — the existing reconciliation board uses `TimeSeries` for its bucket chart. Use `TimeSeries` for the two "bar" charts here too and configure the bar style via the dashboard UI post-create if needed.

- [ ] **Step 3: Draft the `layout` array**

12-column grid, four logical rows (pills row spans two grid rows due to height-2 tiles for pills + height-3 for delta variants — we'll keep them at h=3 to match the headline strip).

```json
[
  { "i": "pill-bot-err",     "x": 0, "y": 0, "w": 3, "h": 3 },
  { "i": "pill-lambda-err",  "x": 3, "y": 0, "w": 3, "h": 3 },
  { "i": "pill-trpc-err",    "x": 6, "y": 0, "w": 3, "h": 3 },
  { "i": "pill-agent-err",   "x": 9, "y": 0, "w": 3, "h": 3 },

  { "i": "pill-bot-delta",   "x": 0, "y": 3, "w": 3, "h": 2 },
  { "i": "pill-lambda-delta","x": 3, "y": 3, "w": 3, "h": 2 },
  { "i": "pill-trpc-delta",  "x": 6, "y": 3, "w": 3, "h": 2 },
  { "i": "pill-agent-delta", "x": 9, "y": 3, "w": 3, "h": 2 },

  { "i": "ts-volume",        "x": 0, "y": 5, "w": 6, "h": 5 },
  { "i": "ts-error-rate",    "x": 6, "y": 5, "w": 6, "h": 5 },

  { "i": "bar-top-errors",   "x": 0, "y": 10, "w": 6, "h": 5 },
  { "i": "bar-lambda-prefix","x": 6, "y": 10, "w": 6, "h": 5 },

  { "i": "logs-fatal-tail",  "x": 0, "y": 15, "w": 12, "h": 8 }
]
```

---

## Task 4: Create the dashboard

**Files:** none

- [ ] **Step 1: Call `mcp__axiom__createDashboard`**

Pass:

- `name`: `"Service health overview"`
- `description`: `"Day-one operational view: per-surface error rate, traffic Δ vs 7d, top errors, fatal log tail. Spec: docs/superpowers/specs/2026-05-12-axiom-service-health-overview-design.md"`
- `refreshTime`: `60` (seconds — match the reference dashboard's format; if the MCP rejects, try `"60s"`)
- `timeWindowStart`: `"qr-now-24h"`
- `timeWindowEnd`: `"qr-now"`
- `charts`: the array from Task 3 Step 2
- `layout`: the array from Task 3 Step 3

Expected: a response with the new dashboard's `uid`. Record it.

- [ ] **Step 2: Fetch the created dashboard back**

Call `mcp__axiom__getDashboard` with the new `uid`. Confirm the response shows all 13 charts and the layout matches what was sent. If any chart is missing or has its APL truncated/escaped wrong, note which and proceed to Task 5 fixes.

---

## Task 5: Fix any creation errors

If Task 4 Step 2 reveals problems (escaping issues in the embedded APL, wrong chart `type` strings, missing fields), patch them via `mcp__axiom__updateDashboard` or `mcp__axiom__updateDashboardChart`.

**Files:** none

- [ ] **Step 1: For each broken chart, fix the APL and update**

If a chart's APL has escaping issues, call `mcp__axiom__updateDashboardChart` with the corrected `apl` for that chart's `id`. The reference dashboard's APL stores quoted dataset names as `['bananasplitz']` and quoted field names as `['err.message']`, with embedded double-quotes escaped as `\"`. Mirror that.

- [ ] **Step 2: If layout is off, update via `mcp__axiom__updateDashboard`**

Pass the corrected `layout` array.

- [ ] **Step 3: Re-fetch and verify**

Call `mcp__axiom__getDashboard` again. All charts render with correct APL, layout matches.

---

## Task 6: Live smoke test

Validate each panel returns sensible data. This is the only "testing" step — the equivalent of running the test suite.

**Files:** none

- [ ] **Step 1: Pill cross-check**

For each of the four error-rate pills, run the same APL via `mcp__axiom__queryDataset` against the same 24h window. Confirm the value matches what the pill displays in Axiom. Acceptable difference: zero (pills compute the same APL).

- [ ] **Step 2: Surface volume sum**

Run:

```kusto
['bananasplitz']
| where _time > ago(24h)
| summarize total = count()
```

Then run:

```kusto
['bananasplitz']
| where _time > ago(24h)
| extend surface = case(
    service == "bot", "bot",
    service == "lambda" and action startswith "agent.", "agent",
    service == "lambda" and (isnotempty(procedure) or action == "trpc.call.start"), "trpc",
    "lambda"
  )
| summarize per_surface = count() by surface
| summarize sum_per_surface = sum(per_surface)
```

Expected: `total == sum_per_surface`. If they differ, the surface `case` is dropping rows — investigate.

- [ ] **Step 3: Render check at three windows**

In the Axiom UI (or via the dashboard URL), switch the time picker to 15m, then 24h, then 7d. Confirm every panel renders without errors at each window. Record any panel that breaks at a specific zoom level.

- [ ] **Step 4: Catch-all surface inspection**

Inspect the rows that landed in `surface == "lambda"` (the catch-all):

```kusto
['bananasplitz']
| where _time > ago(24h)
| extend surface = case(
    service == "bot", "bot",
    service == "lambda" and action startswith "agent.", "agent",
    service == "lambda" and (isnotempty(procedure) or action == "trpc.call.start"), "trpc",
    "lambda"
  )
| where surface == "lambda"
| summarize count() by action
| top 20 by count_
```

If a meaningful chunk is clearly tRPC or agent traffic that the rules missed, file a follow-up to refine the rules (or refine immediately and re-run Task 5).

---

## Task 7: Document the result

**Files:**
- Modify: `docs/superpowers/specs/2026-05-12-axiom-service-health-overview-design.md`

- [ ] **Step 1: Append a "Build notes" section to the spec**

Add this section at the bottom of the spec, filling in actual values:

```markdown
## Build notes (2026-05-12)

- Dashboard UID: `<uid from Task 4 Step 1>`
- Dashboard URL: `<axiom URL>`
- Created via `mcp__axiom__createDashboard`
- Pre-flight probe results (Task 1):
  - `service` field values seen: `bot`, `lambda` (only)
  - `procedure` is `lambda`-only: confirmed | exceptions: …
  - Catch-all `surface == "lambda"` distribution sane: yes | no (notes…)
- Traffic-delta caveat: the `Δ7d` pills compare current dashboard window against the fixed 24h slice ending 7d ago. They read correctly when the dashboard window is 24h (the default); at other windows the delta is "current window vs same-length window 7d ago" only if Axiom propagates the window to `cur` automatically. If not, the delta value is "current dashboard window vs the fixed 24h slot 7d ago" — useful but mislabeled. Revisit if we change the default window.
```

- [ ] **Step 2: Commit and push**

```bash
git add docs/superpowers/specs/2026-05-12-axiom-service-health-overview-design.md
git commit -m "docs: record axiom service health dashboard build details"
git push
```

(Same branch as the spec: `docs/axiom-service-health-spec`. The branch already has an open PR #305; this commit appends to it.)

---

## Done definition

- Dashboard `Service health overview` exists in Axiom with all 13 panels rendering.
- Surface volume sums to total event count (no rows dropped by the `case`).
- All panels render at 15m, 24h, and 7d windows.
- Spec is updated with the dashboard UID, URL, and any rule refinements.
- PR #305 is up to date and ready to merge (the spec is the source of truth for what was built).
