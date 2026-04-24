# Category retrofit — older features

**Date:** 2026-04-24
**Author:** bubu (RQ)
**Status:** Design approved

## Problem

Recent work added category support across new surfaces — the chat expense row (`ChatExpenseCell`), the floating category aggregation ticker, expense notification messages, the snapshot share message, and the CLI. Three user-facing surfaces that render expenses were built before categories landed and still don't show category information:

1. **`ExpenseDetailsModal`** — the full expense detail view opened when tapping an expense row. Shows description, payer, split amounts, split method — but no category.
2. **`SnapshotExpenseCell`** (inside `SnapshotDetailsModal`) — the expense list shown when viewing an existing snapshot.
3. **`ExpenseCell`** inside **`VirtualizedExpenseList`** — the expense picker used in `CreateSnapshotPage` and `EditSnapshotPage` when selecting which expenses to include in a snapshot.

The inconsistency creates a gap: users can classify and aggregate by category elsewhere, but category disappears from these views.

## Non-goals

- Adding a "filter by category" control to `TransactionFiltersModal`. That's a missing filter, not a missing display, and is out of scope here.
- Modifying tRPC endpoints to eagerly join category metadata. Client-side resolution via `@repo/categories` `resolveCategory()` is the established pattern and suffices.
- Adding unit tests for the three components. None exist today; this retrofit doesn't introduce them.

## Design

### UI placement (decided via visual mockups)

| Surface | Placement |
|---|---|
| `SnapshotExpenseCell` | Drop the `ChatMemberAvatar` in the `before` slot. Replace with a 44×44 emoji square, identical to `ChatExpenseCell`'s pattern (`bg-[rgba(255,255,255,0.06)]` rounded-xl container, category emoji centered). Payer identity is already surfaced by the "Name spent" subhead. |
| `VirtualizedExpenseList` `ExpenseCell` | `before` becomes a flex container holding the existing `<Checkbox/>` followed by a 44×44 emoji square to its right. Checkbox remains the selection affordance. |
| `ExpenseDetailsModal` | Inside the existing "What was this for?" section cell: 36×36 emoji square in `before`, description as the cell title, category title (e.g. "Food") as the cell subtitle. No new section added. 36×36 (smaller than row surfaces) to read as meta rather than a hero element. |

**Uncategorized fallback** (all three surfaces): emoji defaults to `"❓"`, matching `ChatExpenseCell.tsx:261`. In the detail modal, the subtitle reads `"Uncategorized"`.

### Data flow

The established pattern set by `ChatExpenseCell` + `VirtualizedCombinedTransactionSegment`: the parent list fetches `category.listByChat` once, resolves each expense via `resolveCategory(categoryId, chatCategories)`, and passes `categoryEmoji` down as a prop. Apply uniformly:

| Surface | Fetcher | Props threaded down |
|---|---|---|
| `SnapshotExpenseCell` | `SnapshotDetailsModal` (has `chatId` in scope) | `categoryEmoji?: string` |
| `VirtualizedExpenseList` `ExpenseCell` | `VirtualizedExpenseList` (already receives `chatId`) | `categoryEmoji?: string` |
| `ExpenseDetailsModal` | `VirtualizedCombinedTransactionSegment` (already fetches categories and resolves per row). `ChatExpenseCell` receives the resolved values and forwards them into the modal. | `categoryEmoji?: string`, `categoryTitle?: string` |

`categoryTitle` is a new prop — needed only by the detail modal's subtitle text. The upstream resolver is extended to produce both emoji and title; `ChatExpenseCell` accepts a new `categoryTitle` prop alongside the existing `categoryEmoji` and forwards both into `<ExpenseDetailsModal/>` at line 344.

No tRPC schema changes. `expense.getAllExpensesByChat` and `expense.getExpenseDetails` continue to return `categoryId` only.

**Caching:** `category.listByChat` is already cached per-chat by tRPC. Each surface adds at most one extra query per chat-session, and in practice the cache is warm because the Chat page pre-fetches categories.

### Component changes (file-level)

**[apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx](../../../apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx)**
- Add `categoryEmoji?: string` and `categoryTitle?: string` to `ExpenseDetailsModalProps`.
- In the "What was this for?" section cell, add `before={<div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-lg leading-none">{categoryEmoji ?? "❓"}</div>}`.
- Render description as the `<Cell>` title (keep current `<Text className="text-wrap">{expense.description}</Text>`) and add `subtitle={<Caption>{categoryTitle ?? "Uncategorized"}</Caption>}`.

**[apps/web/src/components/features/Chat/ChatExpenseCell.tsx](../../../apps/web/src/components/features/Chat/ChatExpenseCell.tsx)**
- Resolver currently produces `categoryEmoji` in the parent. Extend to also produce `categoryTitle` (i.e. `resolveCategory(...)` returns both).
- Pass both into `<ExpenseDetailsModal/>` at the existing render site.
- Callers of `ChatExpenseCell` that pre-resolve `categoryEmoji` (e.g. [VirtualizedCombinedTransactionSegment.tsx:232](../../../apps/web/src/components/features/Chat/VirtualizedCombinedTransactionSegment.tsx#L232)) start also passing `categoryTitle`.

**[apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx](../../../apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx)**
- Add `trpc.category.listByChat.useQuery({ chatId })` inside `SnapshotDetailsModal`.
- Compute an `expenseId → categoryEmoji` map using `resolveCategory()` against the fetched categories. (Memoize on `expenses` + `categories`.)
- `SnapshotExpenseCell` gains `categoryEmoji?: string`.
- Replace `before={<ChatMemberAvatar userId={expense.payerId} size={48} />}` with the 44×44 emoji-square div (same markup as `ChatExpenseCell.tsx:260-262`).
- Verify `SnapshotExpense` type (declared inline at `SnapshotDetailsModal.tsx:555-574`) includes `categoryId: string | null`. If the backing tRPC output doesn't already carry it, add it server-side — a selection-only change in the snapshot-details query, non-breaking.

**[apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx](../../../apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx)**
- Add `trpc.category.listByChat.useQuery({ chatId })` inside the list component.
- Build the same `expenseId → categoryEmoji` map.
- Inner `ExpenseCell` gains `categoryEmoji?: string`.
- `before` becomes a small flex container: `<div className="flex items-center gap-2"><Checkbox .../><div className="...emoji square...">{categoryEmoji ?? "❓"}</div></div>`.

### Edge cases

- **Deleted custom category.** `resolveCategory(categoryId, currentCategories)` returns `null` → UI falls back to `"❓"` and `"Uncategorized"`. Identical behavior to a genuinely uncategorized expense. No special handling needed.
- **Historical snapshot captured before category support.** Rows show `"❓"`. Acceptable — snapshots are immutable historical records.
- **Chat categories not yet loaded** (query pending). `categoryEmoji` is `undefined` → falls back to `"❓"`. The row renders immediately without flashing a loading state; when categories arrive, the emoji updates.

### Testing

- Manual UAT in the TMA for each surface, covering three expense states:
  - Base-category expense (e.g. Food) → shows the base emoji
  - Custom chat-category expense → shows the custom emoji
  - Uncategorized expense → shows `❓` (and `"Uncategorized"` subtitle in the detail modal)
- No new automated tests. The three components lack unit tests today and the retrofit is visually verifiable.

## Out of scope / future work

- **Category filter in `TransactionFiltersModal`.** Noted during scoping — not pursued here.
- **Backfilling historical snapshot data** to re-classify expenses captured before AI classification existed. Deliberately skipped; snapshots are historical.
