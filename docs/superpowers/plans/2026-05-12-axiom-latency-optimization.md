# Axiom Latency Optimization Hunt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `Latency optimization hunt` Axiom dashboard against the `bananasplitz` dataset, exactly as specified in `docs/superpowers/specs/2026-05-12-axiom-latency-optimization-design.md`.

**Architecture:** No application code. Probe field coverage → pick the live top-5 msg list for Section 4 → assemble dashboard JSON → create via `mcp__axiom__createDashboard` → live smoke test → record build notes.

**Tech Stack:** Axiom Processing Language (APL), Axiom MCP tools (`mcp__axiom__queryDataset`, `mcp__axiom__createDashboard`, `mcp__axiom__getDashboard`, `mcp__axiom__updateDashboard`).

---

## File structure

- **External resource created:** Axiom dashboard `Latency optimization hunt`.
- **Modify:** `docs/superpowers/specs/2026-05-12-axiom-latency-optimization-design.md` — append a "Build notes" section recording UID, the picked top-5 list, and smoke-test findings.

No application code is written or modified.

---

## Task 1: Verify each leaderboard APL standalone

Each section's APL must return a sensible shape before bundling. Run them via `mcp__axiom__queryDataset` over 7d (24h is too sparse for `count >= 5` to populate all panels).

**Files:** none

- [ ] **Step 1: Verify Section 1 — top by p95**

Run with `startTime: "now-7d"`:

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

Expected: up to 10 rows with `msg`, `count`, `p50_ms`, `p95_ms`, `p99_ms`. `p95_ms >= p50_ms` on every row (sanity).

Record the top 5 `msg` values — they become the hard-coded list in Section 4.

- [ ] **Step 2: Verify Section 1 — top by p99**

Same query, ordered `top 10 by p99_ms desc`. Confirm shape.

- [ ] **Step 3: Verify Section 2 — slowest HTTP routes**

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

Expected: up to 10 rows of HTTP paths. If the result is empty, drop the `count >= 5` filter for inspection — but for the dashboard, keep the filter.

- [ ] **Step 4: Verify Section 2 — slowest tRPC procedures**

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

Expected: up to 10 rows of tRPC procedures.

- [ ] **Step 5: Verify Section 3 — slowest agent tools**

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

No `count >= 5` filter (volume is sparse). Expected: a few rows or empty. Empty is acceptable.

- [ ] **Step 6: Verify Section 3 — LLM TTFB**

```kusto
['bananasplitz']
| where msg == "agent.llm.first_chunk" and isnotnull(latency_ms)
| summarize p95_ms = percentile(latency_ms, 95)
```

Expected: one row, one column `p95_ms`, finite number. Record the value.

- [ ] **Step 7: Pick the Section 4 hard-coded msg list**

From Task 1 Step 1's top-by-p95 result, take the top 5 `msg` values. Record them. These become the literal strings in Section 4's APL.

---

## Task 2: Assemble the dashboard payload

**Files:** none

- [ ] **Step 1: Construct the Section 4 APL using the picked top-5**

Take the 5 msg values recorded in Task 1 Step 7 and substitute into:

```kusto
['bananasplitz']
| where isnotnull(duration_ms) and msg in ("<msg-1>", "<msg-2>", "<msg-3>", "<msg-4>", "<msg-5>")
| summarize p95_ms = percentile(duration_ms, 95) by bin_auto(_time), msg
```

Verify it returns rows via `mcp__axiom__queryDataset` over 7d before bundling.

- [ ] **Step 2: Draft the `charts` array**

9 charts total. Use chart type `Table` for the 5 leaderboards, `Statistic` for LLM TTFB, `TimeSeries` for the over-time chart.

The JSON-encoded APL strings must escape internal double quotes as `\"`. Example structure:

```json
[
  {
    "id": "table-top-p95",
    "name": "Top 10 slowest msg (by p95)",
    "type": "Table",
    "query": { "apl": "['bananasplitz'] | where isnotnull(duration_ms) and isnotempty(msg) | summarize count = count(), p50_ms = percentile(duration_ms, 50), p95_ms = percentile(duration_ms, 95), p99_ms = percentile(duration_ms, 99) by msg | where count >= 5 | top 10 by p95_ms desc" }
  },
  {
    "id": "table-top-p99",
    "name": "Top 10 slowest msg (by p99)",
    "type": "Table",
    "query": { "apl": "['bananasplitz'] | where isnotnull(duration_ms) and isnotempty(msg) | summarize count = count(), p50_ms = percentile(duration_ms, 50), p95_ms = percentile(duration_ms, 95), p99_ms = percentile(duration_ms, 99) by msg | where count >= 5 | top 10 by p99_ms desc" }
  },
  {
    "id": "table-http-routes",
    "name": "Slowest HTTP routes",
    "type": "Table",
    "query": { "apl": "['bananasplitz'] | where msg == \"req.end\" and isnotnull(duration_ms) and isnotempty(path) | summarize count = count(), p50_ms = percentile(duration_ms, 50), p95_ms = percentile(duration_ms, 95), p99_ms = percentile(duration_ms, 99) by path | where count >= 5 | top 10 by p95_ms desc" }
  },
  {
    "id": "table-trpc-procs",
    "name": "Slowest tRPC procedures",
    "type": "Table",
    "query": { "apl": "['bananasplitz'] | where msg == \"trpc.call.end\" and isnotnull(duration_ms) and isnotempty(procedure) | summarize count = count(), p50_ms = percentile(duration_ms, 50), p95_ms = percentile(duration_ms, 95), p99_ms = percentile(duration_ms, 99) by procedure | where count >= 5 | top 10 by p95_ms desc" }
  },
  {
    "id": "table-agent-tools",
    "name": "Slowest agent tools",
    "type": "Table",
    "query": { "apl": "['bananasplitz'] | where msg == \"agent.tool.end\" and isnotnull(duration_ms) and isnotempty(tool) | summarize count = count(), p50_ms = percentile(duration_ms, 50), p95_ms = percentile(duration_ms, 95), p99_ms = percentile(duration_ms, 99) by tool | top 10 by p95_ms desc" }
  },
  {
    "id": "stat-llm-ttfb",
    "name": "LLM TTFB p95 (ms)",
    "type": "Statistic",
    "query": { "apl": "['bananasplitz'] | where msg == \"agent.llm.first_chunk\" and isnotnull(latency_ms) | summarize p95_ms = percentile(latency_ms, 95)" }
  },
  {
    "id": "ts-top5-p95",
    "name": "Top-5 msg p95 over time",
    "type": "TimeSeries",
    "query": { "apl": "['bananasplitz'] | where isnotnull(duration_ms) and msg in (\"<msg-1>\", \"<msg-2>\", \"<msg-3>\", \"<msg-4>\", \"<msg-5>\") | summarize p95_ms = percentile(duration_ms, 95) by bin_auto(_time), msg" }
  }
]
```

Total: 7 charts (5 Tables, 1 Statistic, 1 TimeSeries). Substitute the 5 picked msg values into `ts-top5-p95` before submission.

- [ ] **Step 3: Draft the `layout` array**

12-column grid, 4 sections:

```json
[
  { "i": "table-top-p95",     "x": 0, "y": 0,  "w": 6, "h": 8 },
  { "i": "table-top-p99",     "x": 6, "y": 0,  "w": 6, "h": 8 },
  { "i": "table-http-routes", "x": 0, "y": 8,  "w": 6, "h": 6 },
  { "i": "table-trpc-procs",  "x": 6, "y": 8,  "w": 6, "h": 6 },
  { "i": "table-agent-tools", "x": 0, "y": 14, "w": 6, "h": 6 },
  { "i": "stat-llm-ttfb",     "x": 6, "y": 14, "w": 6, "h": 6 },
  { "i": "ts-top5-p95",       "x": 0, "y": 20, "w": 12, "h": 6 }
]
```

- [ ] **Step 4: Validate the full JSON locally**

Write the assembled payload to `/tmp/latency_dashboard_payload.json` and run:

```bash
python3 -c "import json; json.load(open('/tmp/latency_dashboard_payload.json')); print('OK')"
```

Expected: `OK`. If JSON parsing fails, fix escaping and re-validate.

---

## Task 3: Create the dashboard

**Files:** none

- [ ] **Step 1: Call `mcp__axiom__createDashboard`**

Pass the assembled JSON. Required top-level fields:

- `name`: `"Latency optimization hunt"`
- `description`: `"Optimization-hunt board ranking codepaths by tail latency (p95/p99). Spec: docs/superpowers/specs/2026-05-12-axiom-latency-optimization-design.md"`
- `owner`: `"X-AXIOM-EVERYONE"`
- `refreshTime`: `60`
- `schemaVersion`: `2`
- `timeWindowStart`: `"qr-now-24h"`
- `timeWindowEnd`: `"qr-now"`
- `charts`: the array from Task 2 Step 2
- `layout`: the array from Task 2 Step 3

Expected: response with `uid`. Record it.

- [ ] **Step 2: Fetch the created dashboard back**

Call `mcp__axiom__getDashboard` with the new `uid`. Confirm:
- 7 charts present
- Layout matches what was sent
- APL strings round-tripped without escape corruption

If any chart is broken, proceed to Task 4. Otherwise skip.

---

## Task 4: Fix any creation errors

**Files:** none

- [ ] **Step 1: Patch broken charts**

For each broken chart, call `mcp__axiom__updateDashboardChart` with corrected `apl`. Mirror the escape style used by the working health dashboard (`['err.message']` for fields with dots, `\"` inside JSON strings).

- [ ] **Step 2: If layout is off, call `mcp__axiom__updateDashboard`** with the corrected `layout` array.

- [ ] **Step 3: Re-fetch via `mcp__axiom__getDashboard` and confirm**

---

## Task 5: Live smoke test

**Files:** none

- [ ] **Step 1: Side-by-side validation per panel**

For each of the 7 charts, run the chart's exact APL via `mcp__axiom__queryDataset` over the same default 24h window. Compare against what the dashboard panel displays (open the dashboard URL in browser). Numbers should match exactly.

- [ ] **Step 2: Window switch test**

Switch the dashboard time-range to 7d in the UI. Confirm every panel re-renders without error. The leaderboards should populate more rows (more events meet `count >= 5`). Section 4's time-series should show 5 lines.

- [ ] **Step 3: Empty-state test**

Switch to 15m window. Leaderboards likely empty (insufficient samples). Confirm panels render gracefully (empty table, not error). LLM TTFB stat shows `—` if no events.

- [ ] **Step 4: Section 4 line check**

In the 7d window view, confirm Section 4 shows exactly the 5 lines for the picked msg values. If any of the 5 doesn't appear, that codepath had no events in the window — acceptable.

---

## Task 6: Document the result

**Files:**
- Modify: `docs/superpowers/specs/2026-05-12-axiom-latency-optimization-design.md`

- [ ] **Step 1: Append a "Build notes" section**

Add at the bottom of the spec, with actual values:

```markdown
## Build notes (2026-05-12)

- **Dashboard UID:** `<uid from Task 3 Step 1>`
- **Dashboard short ID:** `<id from getDashboard>`
- **Dashboard URL:** `https://app.axiom.co/bananasplitz-vlrx/dashboards/<short-id>`
- **Owner:** `X-AXIOM-EVERYONE`
- **Refresh:** 60s · **Default window:** 24h
- **Created via:** `mcp__axiom__createDashboard` on 2026-05-12

### Section 4 top-5 msg list (picked at build time)

Picked from a 7d query at build time. Refresh this list when the leaderboard rankings shift meaningfully (~quarterly review).

1. `<msg-1>` — p95 `<XXX>ms`
2. `<msg-2>` — p95 `<XXX>ms`
3. `<msg-3>` — p95 `<XXX>ms`
4. `<msg-4>` — p95 `<XXX>ms`
5. `<msg-5>` — p95 `<XXX>ms`

### Smoke test (Task 5)

| Check | Result |
| --- | --- |
| 7 charts render at 24h | <pass/fail + notes> |
| Each panel matches explorer query | <pass/fail> |
| 7d window renders | <pass/fail> |
| 15m empty state is graceful | <pass/fail> |
| Section 4 shows top-5 lines | <pass/fail + which appeared> |

### Known caveats

- LLM TTFB has very low volume (10 events / 7d at build time). The stat will read `—` at short windows.
- Agent tools panel is directional only at current traffic levels.
- Section 4 msg list is static — quarterly refresh required as rankings shift.
```

- [ ] **Step 2: Commit and push**

```bash
git add docs/superpowers/specs/2026-05-12-axiom-latency-optimization-design.md
git commit -m "docs: record latency dashboard UID and build notes"
git push
```

PR #306 picks up the commit automatically.

---

## Done definition

- Dashboard `Latency optimization hunt` exists in Axiom with all 7 panels rendering at the default 24h window.
- Section 4's top-5 msg list is the same 5 codepaths surfaced as worst by the Section 1 p95 leaderboard over 7d.
- Each panel's displayed values match a fresh explorer-query run of the same APL.
- Spec is updated with the dashboard UID, URL, the picked top-5 list, and smoke-test results.
- PR #306 is up to date.
