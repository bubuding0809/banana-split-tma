# Reorderable Categories — Design Spec

**Date:** 2026-04-21
**Branch (brainstorm):** `fix/categories-uat-followups`
**Predecessor:** `docs/superpowers/specs/2026-04-20-expense-categories-design/`

## Goal

Let chat members customize the expense category picker by **reordering** tiles, **hiding** unused ones, and **resetting** to defaults. A single shared configuration per chat, accessed from a new "Organize categories" page.

## Motivation

The picker currently renders two rigid sections (Standard from `BASE_CATEGORIES`, Custom by `createdAt`). Groups have wildly different spending patterns — roommates log Food/Groceries daily, travel chats log Stay/Transport constantly — and everyone else's priorities end up buried or visually identical. Reordering lets each group bring their daily-use tiles to the top; hiding removes the noise.

## Locked scope

| Decision | Choice |
|---|---|
| Picker layout | **Unified flat grid** — drop the Standard/Custom section headers in the picker |
| Ordering scope | **Shared at chat level** — any chat member can edit, applies to everyone |
| Operations | Reorder + hide + reset to defaults |
| Surface | **Dedicated "Organize categories" page** under `/chat/$chatId/settings/categories/organize`, linked from Manage Categories |
| New custom category default | **Prepend to top** when chat has an existing order; append by `createdAt` when chat hasn't reordered yet |
| Reorder interaction | **dnd-kit grid** — whole tile draggable, home-screen style; `Eye` / `EyeOff` tap affordances (lucide-react) for hide/restore; Visible + Hidden grid zones |
| Save | TMA main button |
| Reset | TMA secondary button (danger-styled, confirmation dialog) |
| Library | `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` |

## Out of scope (v1)

- Personal per-user ordering (only shared).
- Custom colors / icons beyond emoji.
- Reordering or hiding the Uncategorized tile (it appears only in the filter picker and stays at the top when present).
- Per-category permissions (e.g., "only admin can reorder").

## Architecture

### DB model — new table `ChatCategoryOrdering`

```prisma
model ChatCategoryOrdering {
  id          String   @id @default(uuid())
  chat        Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  chatId      BigInt
  categoryKey String   // "base:food" | "base:transport" | ... | "chat:<uuid>"
  sortOrder   Int
  hidden      Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([chatId, categoryKey])
  @@index([chatId])
}
```

Also add a back-relation on `Chat`:

```prisma
model Chat {
  // ...
  categoryOrderings  ChatCategoryOrdering[]
}
```

**Sparse semantics:** zero rows for a chat = **default order** (current behavior preserved). The table is only written when a user explicitly reorders or hides via the Organize page, or when a new custom category is created in a chat that already has ordering rows.

**`categoryKey` format** — string discriminator:
- `base:<slug>` for hardcoded base categories (slug matches `BASE_CATEGORIES[i].id` sans the `base:` prefix, which is the current `BASE_CATEGORIES` `id` format).
- `chat:<uuid>` for custom categories (matches the existing `id` field returned by `listByChat`).

We deliberately don't FK `categoryKey` to a single table (base isn't a DB table). Integrity for custom categories is maintained by deleting ordering rows in the `deleteChatCategory` handler's transaction (see below).

### Resolution — `listByChat`

Response shape changes from `{ base, custom }` to a single flat list:

```ts
{
  items: Array<{
    id: string;            // "base:food" | "chat:<uuid>"
    emoji: string;
    title: string;
    kind: "base" | "custom";
    hidden: boolean;       // NEW — always `false` when included; picker filters out hidden
  }>;
  hasCustomOrder: boolean;  // NEW — true iff ChatCategoryOrdering has rows for this chat
}
```

Resolution algorithm:

1. Load `BASE_CATEGORIES` (static) and `ChatCategory` rows for the chat.
2. Load `ChatCategoryOrdering` rows for the chat.
3. **Zero ordering rows** → return `{ items: [...base, ...customByCreatedAt], hasCustomOrder: false }`. No hidden tiles. Matches today's behavior.
4. **Ordering rows exist** → for each base + custom tile:
   - If a matching `ChatCategoryOrdering` row exists, render at its `sortOrder` and honor its `hidden` flag.
   - If no matching row exists (e.g., a new BASE_CATEGORIES slug shipped after the chat saved an order), render at the end of the visible list, unhidden. Defensive fallback.
5. Sort by `sortOrder`, tie-break by `(kind, title)` for determinism.
6. Return `{ items, hasCustomOrder: true }`.

**Two consumers of this endpoint distinguish behavior:**
- **Picker / settings chip row** — filter `hidden === true` before rendering.
- **Organize page** — keep hidden items; group into Visible vs Hidden zones by the `hidden` flag.

To avoid a second round-trip, we include hidden tiles in the response and let the client filter. The hidden set is small (bounded by `BASE_CATEGORIES.length + custom.length`, ~20 in practice), so no bandwidth concern.

### tRPC mutations

#### `category.setOrdering`

```ts
input: {
  chatId: number,
  items: Array<{
    categoryKey: string,
    sortOrder: number,
    hidden: boolean,
  }>
}
// output: { ok: true }
```

**Replace-all transaction:**
1. `assertChatAccess`.
2. Validate every `categoryKey`:
   - `base:<slug>` must match a known `BASE_CATEGORIES` id.
   - `chat:<uuid>` must match a `ChatCategory` row belonging to this `chatId`.
   - Reject with 400 on any unknown key.
3. Validate that `items` covers **all** currently-existing tiles for the chat (base + custom). Reject otherwise. This prevents partial saves that would leave orphaned tiles rendering at the end.
4. In a single transaction: `DELETE FROM ChatCategoryOrdering WHERE chatId = ?`, then `INSERT` all items.

We use replace-all instead of diffing because the Organize page already owns the full list client-side and diffing would add complexity with no user benefit.

#### `category.resetOrdering`

```ts
input: { chatId: number }
// output: { ok: true }
```

1. `assertChatAccess`.
2. `DELETE FROM ChatCategoryOrdering WHERE chatId = ?`.

### tRPC mutation changes (existing)

#### `category.create` — prepend-when-ordered

After the existing insert of `ChatCategory`, in the same transaction:

```ts
const hasOrdering = await tx.chatCategoryOrdering.count({ where: { chatId } }) > 0;
if (hasOrdering) {
  const minSort = await tx.chatCategoryOrdering.aggregate({
    where: { chatId },
    _min: { sortOrder: true },
  });
  const nextSort = (minSort._min.sortOrder ?? 0) - 1;
  await tx.chatCategoryOrdering.create({
    data: {
      chatId,
      categoryKey: `chat:${newCategory.id}`,
      sortOrder: nextSort,
      hidden: false,
    },
  });
}
```

When the chat has no ordering rows, do nothing — the default order (base then custom-by-createdAt) already places the new tile at the end of the list. That's an intentional v1 inconsistency with "prepend to top" because a chat that hasn't customized doesn't have an order to prepend to; the user can either move it up manually or start reordering.

#### `category.delete` — cascade ordering row

In the existing `deleteChatCategory` transaction, also:

```ts
await tx.chatCategoryOrdering.deleteMany({
  where: { chatId, categoryKey: `chat:${categoryId}` },
});
```

Prisma cascades don't help here because `ChatCategoryOrdering.categoryKey` isn't a FK to `ChatCategory.id` (it's a discriminated string).

### UI

#### New route

- `apps/web/src/routes/_tma/chat.$chatId_.settings.categories.organize.tsx` (file-based route).

#### `OrganizeCategoriesPage.tsx`

Component lives at `apps/web/src/components/features/Settings/OrganizeCategoriesPage.tsx`.

**Layout (see `.superpowers/brainstorm/.../organize-page-v2.html` mockup):**
- Top: one-line help text: *"Drag to reorder. Drag into the Hidden zone (or tap the eye icon) to hide. Shared with everyone in the group."*
- Section: **Visible** — 4-column grid of draggable tiles. Count chip (`9 / 11`) in the section header.
- Section: **Hidden** — 4-column grid with dashed border; tiles rendered at 50% opacity with grayscale emoji. Empty-state copy when nothing hidden.
- Bottom: TMA main button = `Save`, secondary button = `Reset to defaults` (danger-styled, like `EditChatCategoryPage`'s Delete).

**Tile component** (reuse/extend `CategoryTile`):
- Whole tile draggable via `useSortable` from `@dnd-kit/sortable`.
- `Eye` icon badge (lucide-react, top-right, 20×20 circle) when tile is in the Visible zone — tap to hide.
- `EyeOff` icon badge (lucide-react, top-right, 20×20 circle, blue fill) when tile is in the Hidden zone — tap to restore.
- Icons sized 12px inside the 20×20 badge. Stop click propagation so tapping the eye doesn't trigger the tile's drag start.
- `●` small blue dot (top-left, 6×6) on custom tiles.
- Mid-drag: `scale(1.08)` + shadow; original position renders as dashed-border placeholder.

**dnd-kit config:**

```ts
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { delay: 180, tolerance: 8 },
  }),
  useSensor(KeyboardSensor)
);
```

Wrap both zones in a single `DndContext`. Each zone is its own `SortableContext` with `rectSortingStrategy` for grid. The `onDragEnd` handler detects whether the drop landed in the same zone (just reorder) or the other zone (flip `hidden` + append to end of target zone).

**Local draft state:** the page holds `items: OrganizeItem[]` (one list, each item has `{ categoryKey, emoji, title, kind, sortOrder, hidden }`). `isDirty` is `items !== initialItems` by deep-equal. Save is enabled when `isDirty && !isPending`.

**TMA buttons:** follow the same pattern established in `EditChatCategoryPage.tsx`:
- Mount-once effect registers the click handler via a ref (`onSaveRef.current()`), so the subscription doesn't re-fire on every keystroke / drag.
- Separate params-only effect updates `isEnabled` and `isLoaderVisible`.
- Cleanup resets `isVisible: false`, `isEnabled: true`, `isLoaderVisible: false`, and — for the secondary button — `backgroundColor: undefined`, `textColor: undefined`.

**Back button:** `backButton.onClick` — if `isDirty`, `window.confirm("Discard changes?")`. Otherwise navigate directly.

**Reset confirmation:** `window.confirm("Reset to defaults? Custom order and hidden tiles will be cleared.")` → `category.resetOrdering.mutate(...)` → invalidate `category.listByChat` → navigate back.

**Empty-Visible state:** if after editing, `items.filter(i => !i.hidden).length === 0`, keep Save enabled but show a subtle warning line above the Save button: *"All tiles hidden — the picker will be empty."* Don't block the save; the user can still open Organize again.

#### `ManageCategoriesPage.tsx` — new entry point

Add a `ButtonCell` just above the "Create custom category" cell (within the same CUSTOM section, or a new section if cleaner):

```tsx
<ButtonCell
  before={<ArrowUpDown />}
  onClick={() => navigate({
    to: "/chat/$chatId/settings/categories/organize",
    params: { chatId: String(chatId) },
  })}
  style={{ color: tButtonColor }}
>
  Customize order
</ButtonCell>
```

(Use `ArrowUpDown` from `lucide-react`.)

#### `CategoryPickerSheet.tsx` — unified flat grid

- Remove the `base` / `custom` filter + the two section headers for Standard / Custom.
- Keep the Uncategorized section (rendered only when `includeNoneOption`, i.e. the filter context).
- Render a single `<div className="grid grid-cols-4 gap-2">` mapping `items`.
- If `items.filter(i => !i.hidden).length === 0`, render an empty-state with a "Open Organize categories" link.

#### Settings chip row (`CategoriesSection.tsx` in settings)

Uses the same `items` field, filters `hidden`, maps to emoji-only chips. No behavioral change beyond the response shape.

### Route tree regeneration

After adding the new `.organize.tsx` file, regenerate:

```bash
npx @tanstack/router-cli generate
```

## Edge cases

| Case | Behavior |
|---|---|
| Two members save concurrently | Last write wins (replace-all). No merge. v1 accepts this. |
| New `BASE_CATEGORIES` slug ships after a chat saved an order | Renders at the end of Visible, unhidden. No data change needed; covered by the "no matching row" fallback in resolution. |
| Custom category deleted while user has Organize page open with stale state | `setOrdering` validation step rejects with 400 ("Unknown category key"). Client re-invalidates `listByChat` and shows a toast: *"Categories changed — refresh and try again."* |
| User hides every tile and saves | Allowed. Picker renders empty-state with a link to Organize. Warning shown above Save button before confirming. |
| User drags a hidden tile back to Visible but puts it mid-list | Honored — the drop position sets `sortOrder` among visible items; `hidden` flips to `false`. |
| User resets to defaults while a draft has unsaved changes | Confirmation dialog text mentions "this also discards your unsaved changes". |
| User navigates away mid-save | Cleanup hides TMA buttons; the mutation continues (fire-and-forget). The success `onSuccess` invalidates `listByChat`; navigation already happened. Acceptable. |
| Uncategorized in filter picker | Unaffected. Rendered in its own section above the unified grid. Not part of the Organize page. |

## Testing

**Unit tests (`packages/trpc/src/routers/category/__tests__/`):**

1. `listByChat.test.ts`
   - Returns default order when no ordering rows exist (base first in hardcoded order, custom by `createdAt`).
   - Honors `sortOrder` and `hidden` when ordering rows exist.
   - Appends unknown tiles (tiles without matching ordering rows) at end, unhidden.
   - Sets `hasCustomOrder: false` when zero rows, `true` otherwise.

2. `setOrdering.test.ts`
   - Replaces all rows atomically.
   - Rejects unknown `categoryKey`.
   - Rejects partial coverage (items list missing a known tile).
   - Enforces `assertChatAccess`.
   - Transaction rollback on any insert failure.

3. `resetOrdering.test.ts`
   - Deletes all rows for the chat.
   - Is a no-op when no rows exist.
   - Enforces `assertChatAccess`.

4. `createChatCategory.test.ts` — extend:
   - Creates no ordering row when `hasOrdering = false`.
   - Creates an ordering row with `sortOrder = min - 1` when `hasOrdering = true`.

5. `deleteChatCategory.test.ts` — extend:
   - Deletes matching ordering row when one exists.
   - Transaction rollback if either delete fails.

**UI smoke test:** manual UAT (see below).

## UAT flows

Integrate into the existing UAT doc (`docs/superpowers/specs/2026-04-20-expense-categories-uat.md`) as a new Flow 10:

- **10.1** Navigate Manage Categories → Customize order → Organize page renders with all base + custom tiles in Visible.
- **10.2** Drag "Food" to first position → Save → picker on Add Expense reflects new order.
- **10.3** Tap the eye icon on "Entertainment" → it animates to Hidden → Save → picker no longer shows Entertainment.
- **10.4** Open Organize again → Entertainment still in Hidden → tap the eye-off icon → it returns to end of Visible → Save → picker shows it again.
- **10.5** Reset to defaults → confirmation → picker shows original Standard-then-Custom order.
- **10.6** Create a new custom category after saving a custom order → it appears at the top of the picker (prepend behavior).
- **10.7** On a fresh chat with no saved order, create a new custom category → appears at the end (existing behavior preserved).
- **10.8** Hide every tile → Save → picker shows empty-state with a link back to Organize.
- **10.9** Two sessions: A saves an order, B (stale) tries to save → resolve according to last-write-wins; B sees a toast if their draft references a now-deleted custom category.

## Migration

- Add `ChatCategoryOrdering` table via a new Prisma migration. No backfill needed — sparse semantics handle existing chats.
- No changes to existing tables beyond the `Chat` back-relation.

## Dependencies

```
pnpm --filter web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Current bundle impact: core + sortable + utilities is ~30KB gzipped. The Organize page is a settings-only route, not hot path. Acceptable.
