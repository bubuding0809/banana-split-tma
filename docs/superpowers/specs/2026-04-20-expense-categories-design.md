# Expense Categories — Design Spec

**Date:** 2026-04-20
**Status:** Approved, ready for plan
**Source:** Design handoff from claude.ai/design (Categories Feature prototype)

## Goal

Add per-expense categories across the Banana Split product. Each category is a
tag (emoji + title). A fixed set of 10 **base categories** ships with the app;
each chat (group or personal) can define its own **custom categories**. When a
user is creating or editing an expense, a Gemini-powered classifier suggests a
category from the expense description; the user can accept the suggestion or
override manually. Categories also appear as a filter on the transactions list
and as a visual label (emoji) on expense rows.

Surfaces: web Mini App (primary), bot (silent auto-assign on create), CLI
(display + filter).

## Non-goals

- Category colours beyond the emoji (v1 is emoji-only).
- Category-level spending totals / insights dashboards.
- Editing base categories (they are constants).
- Persisting the "auto-assigned" badge past save (transient only — badge shows
  on the add/edit form while the suggestion is the current pick; not stored).
- Bot UX changes for category display (bot auto-assigns silently; user sees
  the category in the Mini App).
- Admin dashboard category views.

## Base categories

Exactly these 10 entries, keyed by `base:<id>`:

| id | emoji | title |
| --- | --- | --- |
| `base:food` | 🍜 | Food |
| `base:transport` | 🚕 | Transport |
| `base:home` | 🏠 | Home |
| `base:groceries` | 🛒 | Groceries |
| `base:entertainment` | 🎉 | Entertainment |
| `base:travel` | ✈️ | Travel |
| `base:health` | 💊 | Health |
| `base:shopping` | 🛍️ | Shopping |
| `base:utilities` | 💡 | Utilities |
| `base:other` | 📦 | Other |

Each entry also carries a representative keyword list used in the classifier
prompt (data-only; no runtime keyword matching — the LLM is the classifier).

## Data model

Prisma migration in `packages/database/prisma/schema.prisma`:

```prisma
model Expense {
  // existing fields preserved
  categoryId  String?   // "base:<id>" or "chat:<uuid>"; null = Uncategorized
  @@index([chatId, categoryId])
}

model ChatCategory {
  id           String   @id @default(uuid())
  chat         Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
  chatId       BigInt
  emoji        String   // single-grapheme emoji
  title        String   // 1–24 chars, unique per chat (case-insensitive)
  createdBy    User     @relation(fields: [createdById], references: [id])
  createdById  BigInt
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([chatId, title])
  @@index([chatId])
}

model Chat {
  // existing fields preserved
  chatCategories ChatCategory[]
}
```

### Design notes

- `Expense.categoryId` is a **plain string**, not a foreign key — it stores
  either `base:<id>` (resolved in code against `BASE_CATEGORIES`) or
  `chat:<uuid>` (resolved by id against `ChatCategory`). This avoids a
  polymorphic foreign key and keeps the schema simple.
- The `chat:` prefix on custom categories is applied at the resolve/persist
  boundary — `ChatCategory.id` is stored as a bare uuid in the table; the
  string form written into `Expense.categoryId` is `` `chat:${id}` ``.
- When a `ChatCategory` is deleted, `Expense.categoryId` is nulled for every
  expense that referenced it (in the same transaction). We do **not**
  cascade-delete expenses.
- Additive migration — no backfill. Existing expenses get `categoryId = null`
  and render as "Uncategorized" (synthetic display label, not persisted).

## Shared package: `@repo/categories`

New workspace package under `packages/categories/`.

```
packages/categories/
├── src/
│   ├── base.ts        # BASE_CATEGORIES readonly constant
│   ├── types.ts       # Category, CategoryId, ResolvedCategory
│   ├── resolve.ts     # resolveCategory(id, chatCategories)
│   ├── classify.ts    # classifyCategory({description, chatCategories, signal})
│   ├── prompt.ts      # system prompt + few-shot examples (pure data)
│   └── index.ts
├── package.json       # deps: @repo/agent, ai, zod
└── tsconfig.json
```

### Public API

```ts
export const BASE_CATEGORIES: ReadonlyArray<BaseCategory>;

export type ResolvedCategory = {
  id: string;          // "base:food" | "chat:<uuid>"
  emoji: string;
  title: string;
  kind: "base" | "custom";
};

export function resolveCategory(
  id: string | null,
  chatCategories: ChatCategory[],
): ResolvedCategory | null;

export async function classifyCategory(args: {
  description: string;
  chatCategories: ChatCategory[];  // empty array allowed
  signal?: AbortSignal;
}): Promise<{ categoryId: string; confidence: number } | null>;
```

### classifyCategory behaviour

- Uses `generateObject` from AI SDK with `getAgentModel()` from `@repo/agent`
  (defaults to `gemini-3.1-flash-lite-preview`).
- Zod schema uses `z.enum([...allowedIds, "none"])` built from base + custom
  ids at call time — the LLM cannot return an invalid id.
- System prompt includes emoji + title + keywords for every allowed category,
  plus a small set of few-shot examples (kept in `prompt.ts` as pure data so
  we can snapshot-test prompt stability).
- Returns `null` when the model returns `"none"`, when confidence < 0.4, or
  when the LLM call throws / times out (3s timeout).
- Honours an `AbortSignal` so debounced client calls can cancel superseded
  LLM requests mid-flight.

## tRPC router

New router `packages/trpc/src/routers/category/`.

```ts
category.suggest({ chatId, description })
  // protectedProcedure, chat-membership check, 20/min per user rate limit
  → { categoryId: string; confidence: number } | { categoryId: null }

category.listByChat({ chatId })
  → { base: ResolvedCategory[]; custom: ResolvedCategory[] }

category.create({ chatId, emoji, title })
  → ResolvedCategory

category.update({ chatCategoryId, emoji?, title? })
  → ResolvedCategory

category.delete({ chatCategoryId })
  // transaction: nulls Expense.categoryId for referencing rows, then deletes
  → { ok: true }
```

### Expense router changes

- `expense.createExpense` and `expense.updateExpense` accept optional
  `categoryId: string | null` input; validated server-side.
- On write, server looks up the id: `base:*` must be in `BASE_CATEGORIES`;
  `chat:<uuid>` must exist in `ChatCategory` scoped to the same `chatId`.
  Otherwise reject with 400 — client re-fetches and retries.
- `expense.getAllExpensesByChat` (and the detail / snapshot queries that
  surface expenses) return `categoryId` on each row.

### Filtering

v1 applies category filtering **client-side** in `ChatTransactionTab`.
The existing tab already filters in-memory by payments/related/date; category
is just one more predicate. **Settlements always pass the category filter**
(they are transfers, not expenses).

## Web UI

Surface-by-surface, mapped to existing files.

### Chat transactions + filter

`apps/web/src/components/features/Chat/ChatTransactionTab.tsx`

- Insert a **Category pill** into the existing filter Cell.
- Pill priority order: active Category → Payments → Related → Date.
- Cap: **2 pills inline + `+N` overflow pill**; clicking the Cell or the `+N`
  pill opens the existing filters modal.
- When no category is active, show a **dashed muted "Category" CTA pill**
  first; tapping it opens the picker.
- Filters modal gains a **Category row** (emoji + title when active, Clear
  button). Tapping the row opens the picker.
- Expense rows render category emoji on the left (next to the existing
  avatar / icon). Settlement rows unchanged.

Refactor: extract the filter Cell + filters modal from `ChatTransactionTab`
into `TransactionFiltersCell.tsx` + `TransactionFiltersModal.tsx` (the tab
is already ~500 lines; the category work pushes the filter logic over the
sensible boundary). No behaviour change.

### Add expense / Edit expense

`apps/web/src/components/features/Expense/AddExpensePage.tsx`,
`EditExpensePage.tsx`, plus a new step component
`CategoryFormStep.tsx`.

- New **Category cell** inserted into the form above Split Mode. Shows
  resolved emoji + title + purple "Auto" sparkle badge when the current
  pick came from a live suggestion.
- `category.suggest` is called debounced (400ms after last keystroke) once
  description length ≥ 3 chars. Uses a local `AbortController` tied to the
  tRPC call; new keystrokes cancel in-flight requests.
- Auto-pick applies only while the user has not manually picked. As soon as
  they tap the cell and choose a category from the sheet, subsequent
  suggestions are ignored.
- On Edit, the category cell is pre-populated from `expense.categoryId` with
  no auto badge (auto is transient).

### Category picker sheet

New `apps/web/src/components/features/Expense/CategoryPickerSheet.tsx`.

- Telegram-UI `Modal` with emoji-tile grid.
- Sections: **Custom** (if any) → **Base**.
- Each tile: square 1:1 aspect ratio, fixed emoji height, title clamped to
  2 lines with consistent line-height — so every tile renders identically
  regardless of label length.
- Footer row: `+ Create custom category` → navigates to the create page
  (closes sheet first).
- Selected tile highlighted; tapping selects + closes the sheet.

### Chat settings entry point

`apps/web/src/components/features/Settings/ChatSettingsPage.tsx`.

- New `CategoriesSection` component inserted between **Base Currency** and
  **Notifications**.
- Renders:
  1. A `Cell` with a blue Tag icon, title "Manage categories", subtitle
     `` `${customs} custom · ${total} total` ``, and a chevron.
  2. Below the cell, a preview chip strip of up to 4 categories (customs
     first) plus a `+N more` chip when there are more. Both taps land on
     the Manage page.
- Footer copy:
  - Group: "Categories are shared by everyone in this group and help
    auto-assign recurring expenses."
  - Personal: "Categories are private to this chat."

### Manage categories page

New route + page:

- `apps/web/src/routes/_tma/chat.$chatId_.settings.categories.tsx`
- `apps/web/src/components/features/Settings/ManageCategoriesPage.tsx`

Two sections:

1. **Custom** — editable rows (tap chevron → edit). Empty-state prompts to
   create the first custom category.
2. **Base** — read-only rows (no chevron).

Footer button / MainButton: **Create custom category**.

### Create / edit custom category

- Routes:
  - `chat.$chatId_.settings.categories.new.tsx`
  - `chat.$chatId_.settings.categories.$categoryId.tsx`
- Page: `EditChatCategoryPage.tsx`.
- Fields: emoji picker + title input.
- Validation:
  - emoji: must be a single grapheme cluster, non-empty.
  - title: trimmed 1–24 chars; unique per chat (case-insensitive) — error
    surfaces a Snackbar on submit.
- Edit mode: additionally shows a **Delete** button that opens a
  `ConfirmationModal` warning that expenses using this category become
  Uncategorized.

### Onboarding tooltip

One-shot tooltip anchored to the filter Cell on the transactions tab: "Tap
to filter by category." Dismiss state stored in `localStorage` keyed by
`${userId}:${chatId}` (matches the prototype — no DB changes).

### Shared sub-components

- `CategoryPill.tsx` — used in filter, picker, expense rows.
- `CategoryTile.tsx` — square tile in the picker grid.
- `SparkleBadge.tsx` — purple "Auto" badge with sparkle icon (reuse existing
  if already present; otherwise ~40 lines).

## Bot integration

`apps/bot/src/features/` expense-creation flow.

- Import `classifyCategory` from `@repo/categories` directly.
- When the Mastra agent's create-expense tool runs, fetch the chat's
  `ChatCategory` rows once per message and call `classifyCategory`.
- Pass the resolved `categoryId` into the expense-create call. On `null`
  result, persist `categoryId: null` (renders as Uncategorized).
- No user-visible UX change in the Telegram chat; the category surfaces when
  the user opens the Mini App.

## CLI integration

`apps/cli`.

- Expense list rows gain `` `${emoji} ${title} ` `` prefix (empty string when
  `categoryId` is null). Category labels resolved once per command via
  `category.listByChat`; cached in-memory.
- New flag `--category <base:id|chat-category-uuid>` on the list commands.
  Filtering rules: settlements always pass the category filter.
- No LLM call in the CLI (it is read-only on the classifier). Adding or
  editing expenses still happens via the Mini App or the bot.
- CHANGELOG entry + version bump per existing CLI release workflow.

## Error handling and edge cases

- **LLM down or times out** (3s): `classifyCategory` returns `null`. Form
  shows no auto badge. User picks manually. Save never blocked by classifier.
- **LLM returns id no longer valid** (category deleted between suggest and
  save): server rejects the `expense.create`/`update` with 400; client
  re-fetches `category.listByChat` and prompts user to pick again.
- **Duplicate title on create / invalid emoji**: surfaced via Zod validator
  + the unique index. Displayed as a Snackbar toast.
- **Concurrent delete of a category during expense create**: `expense.create`
  wraps the category validation + insert in `prisma.$transaction`.
- **Rate limit on `category.suggest`**: in-memory token bucket keyed by
  `userId`, 20 requests per minute. Over-limit returns `null` and logs at
  `warn`. (Upgrade path: Redis-backed limiter.)
- **Telemetry** (via existing logger): `categorySuggested`,
  `categoryAutoAccepted` (user saved without changing the suggestion),
  `categoryOverridden` (user changed before saving). Useful for future
  classifier-quality work.

## Testing

- `packages/categories` — Vitest unit tests:
  - `resolveCategory`: base id, custom id, unknown id, null, mixed custom
    list.
  - `classifyCategory`: mock `getAgentModel()` to return canned
    `generateObject` results. Assert prompt composition, enum guard, abort,
    confidence threshold, `"none"` handling, 3s timeout, AbortSignal.
- `packages/trpc/src/routers/category` — integration tests with a test
  Prisma instance (pattern already used by other routers): CRUD,
  chat-membership auth, cascade-null-on-delete, `expense.create` validation
  of `categoryId`.
- `apps/web` — Playwright component tests (`test:ct`) for:
  - `CategoryPickerSheet` (opening, selecting, create-custom flow).
  - `CategoriesSection` (preview chip strip, empty state).
  - `AddExpenseForm` auto-assign (mocks `category.suggest` to return a
    canned suggestion; asserts badge, override, abort behaviour).
- No LLM-in-the-loop tests in CI. The classifier is mocked at the AI SDK
  boundary.

## Out-of-scope / deferred

- Category spend analytics (would live on a new Stats tab; design defers to a
  later spec).
- Multiple suggestions / top-k with confidence ranking.
- Category colour accents propagating into expense rows.
- Multi-emoji / image icons.
- Drag-to-reorder custom categories.
