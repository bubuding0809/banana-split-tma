# Snapshot Insights Page — Design Spec

**Date:** 2026-04-24
**Status:** Draft (awaiting user review)
**Author:** @bubuding0809 (with Claude)

## Summary

Bring the Telegram share message's rich aggregation views (Category / Date / Payer breakdowns) into the Telegram Mini App as a dedicated full-page surface, and lay the groundwork for richer power-user visualizations.

The existing in-app `SnapshotDetailsModal` is user-centric (shows only "how much *you* spent" + your expense rows). The Telegram share message is group-centric (totals, per-member shares, switchable aggregations). Today a user who wants the group rollup has to scroll their chat for the shared message. This spec closes that gap.

## Goals

- **Parity with share message views** — in-app access to Category / Date / Payer aggregations, with the same grouping semantics.
- **Dedicated surface** — snapshots earn their own route with room for charts and future widgets.
- **Low bundle impact** — introduce one chart library (Recharts) that future aggregation/analytics features can reuse, not a pile of one-off deps.
- **Preserve existing flows** — the snapshot list modal still opens on tap, still supports Share/Edit/Delete. The full page is an *extension*, not a replacement.

## Non-goals (v1)

- Auto-generated insight cards ("You paid 38% of the total…"). *Stretch — reserved for v2.*
- Tap-to-drill list filtering (tap a category bar → filter list). *v2.*
- CSV / data export. *v2.*
- Cross-snapshot comparisons or trends. *v2.*
- Changes to the Telegram share message itself. *Out of scope.*

## Decisions (resolved during brainstorm)

| Decision | Answer | Why |
| --- | --- | --- |
| Primary intent | Unified design (parity + power-user together) | One cohesive shipping milestone, no thin-slice iteration. |
| Shell | Hybrid — modal stays, adds "Open full view" CTA → full page | Preserves existing flows; full page gets room for charts. |
| Page layout | Tab-first (hero → Category/Date/Payer tabs → content) | Fastest path to share-message parity; keeps tabs above the fold. |
| v1 scope | Parity views + bar charts per tab | Everything else (insights, drilldown, export) is v2. |
| Chart library | Recharts (~100KB gz, SVG, JSX-native) — **only** for the chart canvas | Telegram UI has no chart primitives. Everything around the chart (tabs, cells, tooltips, typography, badges) uses Telegram UI. |

## Component principles

**Telegram UI first.** Reach for `@telegram-apps/telegram-ui` primitives before anything else. Match the look/feel of every existing surface (snapshot list, modal, settings). Only introduce third-party or hand-rolled components when Telegram UI has no equivalent — and in this spec that's exactly one place: the bar-chart canvas itself.

**Explicit component mapping:**

| Need | Component | From |
| --- | --- | --- |
| Segmented Cat/Date/Payer tabs | `SegmentedControl` | Telegram UI |
| Hero card (title, total, date range, expense count) | `Section` + `Cell` + `Title`/`Text`/`Caption` | Telegram UI |
| "Your share" chip in hero (tappable) | `Chip` | Telegram UI |
| Grouped expense list under each tab | `Section` + `Cell` (same pattern as existing modal) | Telegram UI |
| Collapsible category groups (if scope creeps here later) | `Accordion` | Telegram UI |
| Member avatars on Payer view | `ChatMemberAvatar` (internal) wrapping Telegram UI `Avatar` | Internal + Telegram UI |
| Chart tooltip content | Custom `content=` render using Telegram UI `Caption`/`Text` | Telegram UI (inside Recharts shell) |
| Loading skeleton | `Skeleton` | Telegram UI |
| Empty / error state | `Placeholder` | Telegram UI |
| Action icons (share, edit, open full view) | `IconButton` | Telegram UI |
| Icon glyphs inside buttons | `lucide-react` (already a dep; matches rest of app) | Existing dep |
| Date formatting | `date-fns` (already a dep) | Existing dep |
| **Bar chart canvas only** | `BarChart` + `Bar` + `XAxis` + `YAxis` + `Tooltip` | **Recharts (new dep)** |

Recharts is scoped strictly to the chart canvas — everything outside the `<BarChart>` JSX subtree (labels, legends, row descriptions, tooltips text) is rendered with Telegram UI. This keeps visual consistency tight and limits Recharts' surface area so it's replaceable if bundle pressure ever forces a change.

## Architecture

### New route

```
/chat/$chatId/snapshots/$snapshotId?view=cat|date|payer
```

- File: [apps/web/src/routes/_tma/chat.$chatId_.snapshots.$snapshotId.tsx](apps/web/src/routes/_tma/chat.$chatId_.snapshots.$snapshotId.tsx)
- `view` is a search param, defaults to `cat`. Enables deep-linking to a specific tab.
- TMA back button routes to `/chat/$chatId/snapshots` (the list).

### Data layer

Reuses the existing `snapshot.getDetails` tRPC query — no new backend endpoints. The existing `currency.getMultipleRates` call is already used by the modal for base-currency conversion; the full page uses the same hook pattern.

**New shared hook:** `useSnapshotAggregations(snapshotId)`

Returns normalized, currency-converted aggregations consumed by both the modal and the full page:

```ts
type Aggregations = {
  status: "pending" | "success" | "error";
  snapshot: SnapshotDetails;
  baseCurrency: string;
  totalInBase: number;
  dateRange: { earliest: Date; latest: Date };
  userShareInBase: number | null; // null = rates still loading
  byCategory: CategoryGroup[]; // sorted desc by total
  byDate: DateGroup[];         // sorted asc by date (chronological)
  byPayer: PayerGroup[];       // sorted desc by total
};

type CategoryGroup = {
  key: string; // resolved category id ("base:food" | "chat:<uuid>" | "__none__")
  emoji: string;
  title: string;
  totalInBase: number;
  items: NormalizedExpense[];
};

type DateGroup = { key: string; date: Date; totalInBase: number; items: NormalizedExpense[] };
type PayerGroup = { payerId: number; payer: { firstName: string }; totalInBase: number; items: NormalizedExpense[] };
```

Grouping and conversion logic **mirrors** `packages/trpc/src/routers/snapshot/shareSnapshotMessage.ts` so the in-app view and the Telegram message agree on totals and ordering. The per-row aggregation logic currently duplicated between `SnapshotPage.tsx` and `SnapshotDetailsModal.tsx` (both compute `userShareTotal`) collapses into this hook.

### Component boundaries

```
apps/web/src/components/features/Snapshot/
├── SnapshotFullPage.tsx              // NEW — route-level, orchestrates hero + tabs
├── SnapshotHero.tsx                   // NEW — title / total / date-range / "your share" chip
├── SnapshotViewTabs.tsx               // NEW — segmented control, URL-synced view state
├── views/
│   ├── CategoryView.tsx               // NEW — bar chart + grouped list
│   ├── DateView.tsx                   // NEW — bar chart + grouped list
│   └── PayerView.tsx                  // NEW — bar chart + grouped list
├── charts/
│   ├── SnapshotBarChart.tsx           // NEW — thin Recharts wrapper (the only Recharts touchpoint)
│   └── SnapshotBarTooltip.tsx         // NEW — Telegram UI typography inside Recharts <Tooltip content=…>
├── hooks/
│   └── useSnapshotAggregations.ts     // NEW — shared aggregation hook
├── SnapshotPage.tsx                   // existing — unchanged (taps still open the modal)
└── SnapshotDetailsModal.tsx           // existing — adds "Open full view" CTA, drops its own aggregation math in favor of the hook
```

Each component has one clear purpose and can be unit-tested in isolation against a fixed `Aggregations` object.

## Page layout

```
┌─────────────────────────────────────┐
│ ←  Tokyo Trip 2026           ↗  ✎  │  ← TMA back, share, edit
├─────────────────────────────────────┤
│                                     │
│  SGD 2,480.00                       │  ← hero: total in base currency
│  18 expenses · 3–12 Apr 2026        │
│  [👤 Your share · SGD 820]          │  ← user chip (tappable → scrolls to Payer tab)
│                                     │
├─────────────────────────────────────┤
│ [📋 Category] [📅 Date] [👤 Payer] │  ← segmented tabs, URL-synced
├─────────────────────────────────────┤
│                                     │
│  ┌─ chart ──────────────────────┐  │
│  │ 🍣 Food        ████████  1120 │  │  ← Recharts horizontal bar
│  │ 🚆 Transit     ███        540 │  │
│  │ 🏨 Stay        ██         380 │  │
│  │ 🎁 Shop        █          250 │  │
│  └───────────────────────────────┘  │
│                                     │
│  ─── grouped list ────────────────  │
│  🍣 Food · 1,120.00                 │  ← same grouping as share message
│    • Sukiyaki dinner · 340 · 5 Apr │
│    • Ramen · 92 · 7 Apr            │
│    ...                              │
│  🚆 Transit · 540.00                │
│    ...                              │
└─────────────────────────────────────┘
```

### Hero

- Rendered as a Telegram UI `Section` containing a `Cell` with `Title` for the total, `Caption` for the subtitle, and a trailing `Chip`/`Badge` for "Your share".
- Total in base currency, large (`Title` level `1`).
- Subtitle: `{count} expenses · {date range}` — reuses `formatDateRange` logic from `shareSnapshotMessage.ts` (extracted to a shared util).
- "Your share" chip only when `userShareInBase > 0`. Tappable → switches to Payer tab and scrolls to the user's row.

### Tabs

- Telegram UI `SegmentedControl` — three items: Category / Date / Payer.
- Active tab = URL `view` param. Switching tabs calls `navigate({ search: { view } })` with `replace: true` — no history spam.
- Default tab: `cat`.
- Deep link: `?view=date` lands directly on the Date tab.

### Per-view content

Each view is a `Section` (Telegram UI) containing:
1. A chart block (Recharts inside a fixed-aspect container — single accent color tied to TMA `buttonColor`).
2. Grouped `Cell` rows — same grouping semantics as the share message.

| Tab | Chart (Recharts) | Grouped list (Telegram UI `Section` + `Cell`) |
| --- | --- | --- |
| Category | Horizontal `BarChart` of categories, sorted desc by total. Shows top 8; the rest collapse into a `➕ N more` row. Y-axis label = `{emoji} {title}`. | Per-category header (emoji + title + total) rendered as a `Cell`; expense rows follow as further `Cell`s (desc, amount, short date). |
| Date | Vertical `BarChart`, chronological (earliest → latest). Each bar = one day's total in base currency. Tooltip on tap shows `{date} · {total}`. | Date-group headers as `Cell` rows, ordered most-recent-day first (matches share message). |
| Payer | Horizontal `BarChart`, sorted desc. Bar row label uses `ChatMemberAvatar` + first name. | Per-payer header (`Cell` with avatar + name + total + expense count) + expense rows. |

All three charts use the **same internal wrapper**: `SnapshotBarChart` — a thin Recharts adapter that accepts `data: { key, label, value }[]` and orientation (`horizontal | vertical`). The wrapper renders the Recharts `<BarChart>` and delegates tooltip content to a small `SnapshotBarTooltip` component built out of Telegram UI `Caption`/`Text`. `onRowClick` is a no-op prop kept as an extension point for v2 drill-down.

### Empty and loading states

- Loading: skeleton hero + 3-bar skeleton chart + 3-row skeleton list. Reuses the existing `Skeleton` from `@telegram-apps/telegram-ui`.
- Snapshot not found / deleted: matches the current modal's `popup.open({ title: "Snapshot Not Found", ... })` behavior, then routes back to the list.
- Empty expenses: reuses `Placeholder` with a friendly "No expenses in this snapshot" copy.

## Modal integration

[SnapshotDetailsModal.tsx](apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx) changes (minimal):

1. Add a prominent **"Open full view"** CTA at the top of the modal body (below the title cell). Icon = `BarChart3` from lucide-react. Click: `navigate({ to: "/chat/$chatId/snapshots/$snapshotId", params, search: { view: "cat" } })` and closes the modal.
2. Replace the inline `userShareTotal` computation with the shared hook.
3. Keep Share / Edit / Delete exactly as they are.

No changes to the snapshot list page (`SnapshotPage.tsx`) — taps still open the modal.

## Chart library setup

- Add `recharts` as an `apps/web` dependency only (not promoted to a `packages/*` dep — no other workspace consumes it yet).
- Recharts usage is confined to `SnapshotBarChart.tsx` and its sibling tooltip. No other file imports from `recharts` directly. If we ever swap it, this is the only blast radius.
- Charts read TMA theme colors via `themeParams` signals (`buttonColor`, `textColor`, `subtitleTextColor`, `secondaryBgColor`) so they respect light/dark mode without a second codepath.
- Tooltip body uses Telegram UI `Caption` + `Text` — the chart doesn't fork typography.

## File impact summary

**New files** (10)
- Route: `apps/web/src/routes/_tma/chat.$chatId_.snapshots.$snapshotId.tsx`
- `SnapshotFullPage.tsx`, `SnapshotHero.tsx`, `SnapshotViewTabs.tsx`
- `views/CategoryView.tsx`, `views/DateView.tsx`, `views/PayerView.tsx`
- `charts/SnapshotBarChart.tsx`, `charts/SnapshotBarTooltip.tsx`
- `hooks/useSnapshotAggregations.ts`

**Modified files** (~2)
- `SnapshotDetailsModal.tsx` — CTA + hook refactor
- `apps/web/package.json` — add `recharts`

**No changes to**
- `packages/trpc/**` (reuses existing `snapshot.getDetails` + `currency.getMultipleRates`)
- `packages/database/**` (no schema change)
- `apps/bot/**` (no bot behavior change)
- The Telegram share message rendering

## Testing

- Unit tests for `useSnapshotAggregations` — given a fixed `SnapshotDetails` + rates, assert correct totals per group and ordering. This is the riskiest logic (currency conversion + grouping parity with the server-side message).
- Component tests (RTL) for `CategoryView` / `DateView` / `PayerView` rendering from a mocked aggregations prop. Snapshot-test the sorted order.
- Visual smoke: the existing `*.spec.tsx` playwright-ct pattern covers SnapshotsLink — add similar for the new page's hero + tab switch.
- No new E2E needed.

## Risks / open questions

- **Bundle budget.** Recharts adds ~100KB gz. If this is above our current TMA bundle budget, we fall back to hand-rolled SVG bars for v1 and reintroduce Recharts when v2 insights/charts arrive. *To verify post-install with `pnpm build` and `apps/web/dist` size diff.*
- **Chart-on-mobile interaction.** Recharts default tooltips are hover-driven; on touch devices the first tap shows the tooltip and the second one registers as a click. Acceptable for v1 — noted for v2 drill-down ergonomics.
- **Color assignment per category.** v1 uses a single accent color for bars (mirrors share message austerity). If users ask for per-category hues, the category color palette becomes a follow-up conversation.
- **User navigation expectation.** Some users may expect tap-on-snapshot-cell to go straight to the full page (skipping the modal). v1 keeps the modal to minimize disruption. If telemetry shows the full-page CTA drives most engagement, we can flip the default in v2.

## Out of scope (v2 candidates, not committed)

- Auto-insights cards above the tabs ("Mia paid most", "Apr 7 was the spendiest day").
- Tap-a-bar → filter the list to that slice.
- CSV export.
- Cross-snapshot comparisons ("This trip spent 20% more on food than the last one").
- Per-category color palette.
- Toggle between bar / donut / treemap on the Category tab.
