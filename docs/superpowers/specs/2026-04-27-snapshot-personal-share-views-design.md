# Snapshot — Personal-Share Aggregation Views

**Date:** 2026-04-27
**Status:** Brainstorm complete — awaiting user spec review
**Author:** Ruoqian Ding (with Claude Opus 4.7)

## Goal

Reframe the mini app's snapshot detail page so its three breakdown
sections answer the question the page is already asking — *"how much
did **you** spend?"* — instead of showing trip-wide totals that don't
sum to the user's number.

The headline mismatch today: the hero card says **"You spent SGD 174.16"**,
but the bars and group totals immediately below sum to **SGD 1,886.97**
(the trip total). Each expense row also shows the full expense amount,
not the user's share.

While we're in there: **drop the "By Payer" view** entirely (mini app
*and* the bot's group message). It carried two reasonable but
contradictory meanings ("who paid the most cash" vs "who am I tangled
up with the most"), and neither is what the page is for.

## Scope

Two surfaces, one design idea, different expressions.

| Surface | Anchor | Bars / group totals | Per-row amount | "By Payer" |
|---|---|---|---|---|
| Mini app snapshot detail page | Personal (your share) | Your share | Your share | **Removed** |
| Bot group message | Group (full totals) | Full totals (unchanged) | Full totals (unchanged) | **Removed** |

The bot message stays group-targeted because it lives in the group
chat — there's no single "you" to anchor on. Personal-share lives
behind the "View Snapshot" deep-link button into the mini app.

## Non-goals

- **Settlement direction.** "Net to/from each payer" was option C in
  the brainstorm. Powerful but overlaps with existing settlement
  features and complicates the bar chart with mixed signs. Skip.
- **Reworking the "🧾 Shares" section** in the bot message. It already
  shows per-person share amounts and stays as-is.
- **New aggregation dimensions** (by status, by currency, etc.).
  Out of scope.

## Mini app changes

### Hero ("How much did you spend?") — no change

The "You spent" card already shows `aggregations.userShareInBase`.
Stays put. It's the anchor everything else now consistently sums to.

### Tabs — Category / Date only

`SnapshotViewTabs` drops the "Payer" tab. Default view stays `cat`.
URL search param `view=payer` should be defensively coerced to `cat`
so old deep-links don't crash.

### By Category view — personal share

- **Bars:** sum of the current user's share per category.
- **Bar scaling:** max-bar = largest *user-share* category total
  (recomputed, not the old full-amount max).
- **Group header:** `🍜 Food · {N} · your share — SGD {your_total}`
  where `N` is the count of expenses **the user has a share in**
  for that category (not the snapshot total count).
- **Empty groups disappear.** If the user has zero share across
  every expense in a category, that category is omitted entirely
  (no bar, no list section).
- **Section label:** `BY CATEGORY · YOUR SHARE`.

### By Date view — personal share

Same shape as By Category, but grouped by date.

- **Bar chart:** day bar heights = sum of user's share that day.
- **Group header:** `📅 26 Apr 2026 · {N} · your share — SGD {your_total}`,
  same count semantics (user's expenses only).
- **Empty days disappear** from both the bar chart and the list.
- **Section label:** `BY DATE · YOUR SHARE`.

### Expense rows — mirror `ChatExpenseCell`

Each row inside the grouped lists drops the full-amount-as-headline
display and matches the main expense list's right-column layout
([ChatExpenseCell.tsx:295-336](apps/web/src/components/features/Chat/ChatExpenseCell.tsx)):

```
Date           e.g. 26 Apr
Share amount   e.g. SGD 32.30      ← red when non-zero, weight=3
"share"        small caption
```

The full expense amount is no longer shown in the row (it's still
visible if the user taps through to expense details).

**Filter:** rows where the user's share is `0` are dropped from the
list entirely. They never appear in any group.

### Data layer — `computeSnapshotAggregations`

Today the function already computes `userShareInBase` for the hero.
We extend the same pattern down through the groups.

**`NormalizedExpense`** gains:

```ts
userShareInBase: number;   // 0 if user has no share in this expense
```

**Group aggregates** (`byCategory`, `byDate`) gain:

```ts
userShareTotalInBase: number;     // sum of userShareInBase across the group
userShareCount: number;           // count where userShareInBase > 0
```

Group lists are then **filtered**: expenses with `userShareInBase === 0`
are excluded from `items[]`, and groups whose `userShareCount === 0`
are excluded from the result entirely.

**`byPayer` is removed** from the return type (and from the function
body — `groupByPayer` and the per-payer iteration go away).

**Cleanup of legacy fields.** After this change, the per-group
`totalInBase` (sum of full expense amounts) is no longer rendered in
the page. Implementation plan should grep for remaining consumers and
remove the field from the per-group aggregate output if unused.
The hero's `aggregations.userShareInBase` and the snapshot-level
`aggregations.totalInBase` (used in the header card) both stay.

## Bot snapshot share message changes

File: `packages/trpc/src/routers/snapshot/shareSnapshotMessage.ts`

- `SNAPSHOT_VIEWS` becomes `["cat", "date"] as const`.
- `VIEW_BUTTONS` drops the `payer` entry — keyboard goes from three
  toggle buttons to two, plus the existing "View Snapshot" deep-link
  button below.
- `renderItemLine` switch loses `case "payer"`.
- `renderBreakdown` no longer routes to `groupByPayer` —
  `groupByPayer` and any payer-only helpers are deleted.
- `legendFor` drops the `payer` branch.
- Default view in `buildSnapshotMessage` stays `cat`.

`renderSnapshotView.ts` automatically tightens via the
`z.enum(SNAPSHOT_VIEWS)` input validator — old `payer` callback data
from already-sent messages will fail Zod validation. We accept this:
the callback handler in `apps/bot/src/features/snapshotView.ts`
already swallows tRPC errors gracefully, and the user can just press
Category or Date instead. No data migration needed.

## Files affected

**Mini app (`apps/web`):**

- `src/components/features/Snapshot/SnapshotViewTabs.tsx` — drop `payer` from views.
- `src/components/features/Snapshot/SnapshotFullPage.tsx` — remove the `PayerView` branch; coerce `view=payer` query param to `cat`.
- `src/components/features/Snapshot/views/PayerView.tsx` — **delete**.
- `src/components/features/Snapshot/views/CategoryView.tsx` — bars + group header use `userShareTotalInBase` / `userShareCount`; section label updates.
- `src/components/features/Snapshot/views/DateView.tsx` — same.
- `src/components/features/Snapshot/views/SnapshotExpenseRow.tsx` — right column matches `ChatExpenseCell`: date / red share amount / "share" caption.
- `src/components/features/Snapshot/aggregations/computeSnapshotAggregations.ts` — add `userShareInBase` per expense, `userShareTotalInBase` + `userShareCount` per group, filter zero-share rows + empty groups, drop payer grouping.
- `src/components/features/Snapshot/hooks/useSnapshotAggregations.ts` — type updates only (no behavioral change).

**Bot / API (`packages/trpc`):**

- `src/routers/snapshot/shareSnapshotMessage.ts` — drop payer from views, buttons, and renderers; remove `groupByPayer`.
- `src/routers/snapshot/renderSnapshotView.ts` — no code change (input validator updates via shared `SNAPSHOT_VIEWS`).

**Bot listener (`apps/bot`):**

- `src/features/snapshotView.ts` — **keep** `payer` in the callback-data regex (`/^s:([0-9a-f-]{36}):(cat|date|payer)$/`). If we narrow the regex, legacy callbacks no-op and the user's tap spinner hangs. By continuing to *match* the old callback shape, the handler forwards it to `renderSnapshotView`, the input validator rejects `payer`, and the existing `try/catch` shows the "Could not switch view" toast. Acceptable degradation for messages already sitting in chat history.

**Scripts:**

- `scripts/preview-snapshot-share.ts` — no change. Loops over `SNAPSHOT_VIEWS`, so it'll just emit two views instead of three.

## Test plan

**Unit / integration:**

- `computeSnapshotAggregations` test cases:
  - User has share in subset of expenses → group totals = sum of their shares only; counts reflect their participation only.
  - User has zero share in entire category → category omitted from `byCategory`.
  - All expenses are user's = full expense → numbers match `userShareInBase` total.
- Bot message renderer test cases:
  - `buildSnapshotMessage(ctx, "cat")` → no payer button in keyboard.
  - `buildSnapshotMessage(ctx, "date")` → same.
  - Calling `renderSnapshotView` with `view: "payer"` → Zod throws (expected, gracefully handled in callback).

**Manual UAT (mini app):**

- Open a snapshot where you (the viewing user) have share in some but
  not all expenses. Verify:
  - "You spent" total = sum of all bars in Category view = sum of all
    bars in Date view.
  - Per-row amounts in red, "share" caption, mirror main expense list.
  - Categories you weren't in (zero share) don't appear at all.
  - Group counts say "5" not "20" when 5 of 20 are yours.
- Open a snapshot where you have share in nothing → expect graceful
  empty state (covered by existing logic; verify no regressions).
- Tabs show only Category / Date — no Payer chip.
- Stale URL `?view=payer` lands on Category view, no error.

**Manual UAT (bot):**

- Create a snapshot from the mini app → bot posts to group → message
  has two toggle buttons (Category, Date) plus the View Snapshot
  deep-link button. No Payer button.
- Toggle between Category and Date — both render. The "🧾 Shares"
  section appears in both, unchanged.
- Open a snapshot message that was posted *before* this change (still
  has a Payer button if any exist) — pressing Payer doesn't crash the
  bot; pressing Category or Date works. (Acceptable degradation.)

## Open questions

None resolved during brainstorm. All five clarifying questions
answered:

1. Group counts use the user's count only.
2. Zero-share rows dropped entirely.
3. Row layout mirrors `ChatExpenseCell`.
4. Empty groups disappear.
5. Section label gets `· YOUR SHARE`.

## Implementation notes / order

A natural sequence (worked out in the implementation plan, not here):

1. Data layer: `computeSnapshotAggregations` — add user-share fields,
   filter, drop payer. Add unit tests.
2. Row component: update `SnapshotExpenseRow` to the `ChatExpenseCell`
   right-column pattern.
3. Views: `CategoryView` and `DateView` consume new fields, label
   updates, empty-state handling.
4. Tabs: drop Payer, coerce stale `view=payer` query param.
5. Delete `PayerView.tsx` and any imports.
6. Bot message: drop payer view, button, render branch.
7. Run preview script + manual UAT in TMA + group chat.
