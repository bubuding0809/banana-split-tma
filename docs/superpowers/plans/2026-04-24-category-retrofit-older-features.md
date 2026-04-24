# Category Retrofit — Older Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add category display to the three expense-rendering surfaces built before category support landed: `ExpenseDetailsModal`, `SnapshotExpenseCell`, and `VirtualizedExpenseList`.

**Architecture:** Reuse the `ChatExpenseCell` emoji-square idiom uniformly. Category resolution stays client-side — parent components fetch `category.listByChat`, resolve each expense via `@repo/categories` `resolveCategory()`, and pass `categoryEmoji` (plus `categoryTitle` for the detail modal) down as props. No tRPC schema changes.

**Tech Stack:** React, TypeScript, tRPC, `@telegram-apps/telegram-ui`, Tailwind, `@repo/categories`.

**Spec:** [docs/superpowers/specs/2026-04-24-category-retrofit-older-features-design.md](../specs/2026-04-24-category-retrofit-older-features-design.md)

**Testing posture:** No automated tests exist for these components and the spec explicitly excludes adding them. Each task verifies via `pnpm turbo run lint` + `pnpm turbo run typecheck`. Manual UAT in the TMA is the final gate (Task 5).

---

## File Structure

**No files created.** Five modified:

| File | Responsibility after changes |
|---|---|
| [apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx](../../../apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx) | Fetch chat categories, resolve per expense, render emoji square in `SnapshotExpenseCell` replacing avatar. |
| [apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx](../../../apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx) | Accept new `chatId` prop, fetch categories, resolve per expense, render emoji square beside the checkbox. |
| [apps/web/src/components/features/Snapshot/CreateSnapshotPage.tsx](../../../apps/web/src/components/features/Snapshot/CreateSnapshotPage.tsx) | Pass `chatId` to `VirtualizedExpenseList`. |
| [apps/web/src/components/features/Snapshot/EditSnapshotPage.tsx](../../../apps/web/src/components/features/Snapshot/EditSnapshotPage.tsx) | Pass `chatId` to `VirtualizedExpenseList`. |
| [apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx](../../../apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx) | Accept `categoryEmoji` + `categoryTitle` props; render emoji square and category title inside the "What was this for?" section cell. |
| [apps/web/src/components/features/Chat/ChatExpenseCell.tsx](../../../apps/web/src/components/features/Chat/ChatExpenseCell.tsx) | Accept new `categoryTitle` prop; forward `categoryEmoji` + `categoryTitle` into `<ExpenseDetailsModal/>`. |
| [apps/web/src/components/features/Chat/VirtualizedCombinedTransactionSegment.tsx](../../../apps/web/src/components/features/Chat/VirtualizedCombinedTransactionSegment.tsx) | Resolve both `emoji` and `title` from `resolveCategory()` and pass both to `ChatExpenseCell`. |

---

## Task 1: Retrofit `SnapshotDetailsModal` — categories in snapshot view

**Files:**
- Modify: `apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx`

Current `SnapshotExpenseCell` renders a `ChatMemberAvatar` in the `before` slot. Drop it and put a 44×44 emoji square there instead (same markup as `ChatExpenseCell.tsx:260-262`).

- [ ] **Step 1.1: Add category imports at the top of the file**

Add to the existing import block at the top of [apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx](../../../apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx):

```tsx
import { resolveCategory } from "@repo/categories";
```

- [ ] **Step 1.2: Add `categoryId` to the inline `SnapshotExpense` type**

Locate the inline type declaration at [SnapshotDetailsModal.tsx:555-574](../../../apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx#L555-L574). Add `categoryId: string | null` to it. The type becomes:

```ts
type SnapshotExpense = {
  id: string;
  chatId: number;
  creatorId: number;
  payerId: number;
  description: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  date: Date;
  createdAt: Date;
  payer: {
    id: number;
    firstName: string;
  };
  shares: {
    userId: number;
    amount: number | null;
  }[];
};
```

The backing tRPC endpoint `snapshot.getDetails` at [packages/trpc/src/routers/snapshot/getSnapshotDetails.ts:64-87](../../../packages/trpc/src/routers/snapshot/getSnapshotDetails.ts#L64-L87) already spreads `...expense` so `categoryId` is already in the wire payload — no server-side change needed.

- [ ] **Step 1.3: Fetch chat categories inside `SnapshotDetailsModal`**

Inside the `SnapshotDetailsModal` component body (near the existing `trpc.chat.getChat.useQuery` call around line 101), add a `category.listByChat` query gated on `snapShotDetails?.chatId`:

```tsx
const { data: categoriesData } = trpc.category.listByChat.useQuery(
  {
    chatId: snapShotDetails?.chatId ?? 0,
  },
  {
    enabled: open && !!snapShotDetails?.chatId,
  }
);
```

- [ ] **Step 1.4: Build an `expenseId → categoryEmoji` map and memoize it**

Derive `chatRows` from the fetched `categoriesData` (filtering to custom entries only, since `resolveCategory` expects `ChatCategoryRow[]` — base categories are resolved against the static table inside `resolveCategory`). Then produce the map.

Add this memo alongside the other `useMemo` blocks in the modal body:

```tsx
const categoryEmojiByExpenseId = useMemo(() => {
  const chatRows =
    categoriesData?.items
      .filter((c) => c.kind === "custom")
      .map((c) => ({
        id: c.id.replace(/^chat:/, ""),
        emoji: c.emoji,
        title: c.title,
      })) ?? [];
  const map = new Map<string, string>();
  for (const expense of snapShotDetails?.expenses ?? []) {
    const resolved = resolveCategory(expense.categoryId, chatRows);
    if (resolved?.emoji) map.set(expense.id, resolved.emoji);
  }
  return map;
}, [categoriesData, snapShotDetails]);
```

Note: `category.listByChat` returns items whose `id` is prefixed (`"base:food"` or `"chat:<uuid>"`). `resolveCategory` expects `ChatCategoryRow[]` with bare uuids for custom categories — hence the `.replace(/^chat:/, "")` normalisation above.

- [ ] **Step 1.5: Pass `categoryEmoji` into `SnapshotExpenseCell`**

At the render site for `SnapshotExpenseCell` ([SnapshotDetailsModal.tsx:543](../../../apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx#L543)), thread the resolved emoji:

```tsx
<SnapshotExpenseCell
  expense={expense}
  userId={userId}
  categoryEmoji={categoryEmojiByExpenseId.get(expense.id)}
/>
```

- [ ] **Step 1.6: Accept and render `categoryEmoji` inside `SnapshotExpenseCell`**

Update the `SnapshotExpenseCell` component at [SnapshotDetailsModal.tsx:577-636](../../../apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx#L577-L636):

1. Extend its props type to `{ expense: SnapshotExpense; userId: number; categoryEmoji?: string }`.
2. Replace `before={<ChatMemberAvatar userId={expense.payerId} size={48} />}` with the emoji square.

The cell's `before` becomes:

```tsx
before={
  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-xl leading-none">
    {categoryEmoji ?? "❓"}
  </div>
}
```

- [ ] **Step 1.7: Remove the now-unused `ChatMemberAvatar` import if no other usage remains**

Run:

```bash
grep -n "ChatMemberAvatar" apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx
```

If the only remaining hit is the import line, delete it. Otherwise, leave the import (it's still used elsewhere in the modal).

- [ ] **Step 1.8: Typecheck and lint**

From the repo root:

```bash
pnpm turbo run typecheck --filter=web
pnpm turbo run lint --filter=web
```

Expected: both pass with no new errors or warnings.

- [ ] **Step 1.9: Commit**

```bash
git add apps/web/src/components/features/Snapshot/SnapshotDetailsModal.tsx
git commit -m "$(cat <<'EOF'
feat(web): show category emoji in snapshot expense list

SnapshotExpenseCell now shows the category emoji in place of the
payer avatar, matching the ChatExpenseCell pattern. Payer identity is
already surfaced in the "Name spent" subhead.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Retrofit `VirtualizedExpenseList` — categories in the snapshot picker

**Files:**
- Modify: `apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx`
- Modify: `apps/web/src/components/features/Snapshot/CreateSnapshotPage.tsx`
- Modify: `apps/web/src/components/features/Snapshot/EditSnapshotPage.tsx`

`VirtualizedExpenseList` is used by both `CreateSnapshotPage` and `EditSnapshotPage` as the expense picker. The inner `ExpenseCell` has `<Checkbox/>` in the `before` slot. Add an emoji square immediately to the right of the checkbox.

`VirtualizedExpenseList` doesn't currently receive `chatId`. Add it as a prop (both call sites have `chatId` available from the route).

- [ ] **Step 2.1: Add `chatId` prop to `VirtualizedExpenseList`**

Update the props interface at [VirtualizedExpenseList.tsx:38-42](../../../apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx#L38-L42):

```tsx
interface VirtualizedExpenseListProps {
  chatId: number;
  expenses: RouterOutputs["expense"]["getExpenseByChat"];
  selectedExpenseIds: string[];
  onExpenseToggle: (updater: Updater<string[]>) => void;
}
```

And destructure it in the function signature at [VirtualizedExpenseList.tsx:44-48](../../../apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx#L44-L48):

```tsx
const VirtualizedExpenseList = ({
  chatId,
  expenses,
  selectedExpenseIds,
  onExpenseToggle,
}: VirtualizedExpenseListProps) => {
```

- [ ] **Step 2.2: Add the category import**

Add to the top of [VirtualizedExpenseList.tsx](../../../apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx):

```tsx
import { resolveCategory } from "@repo/categories";
```

- [ ] **Step 2.3: Fetch categories and build the emoji map inside `VirtualizedExpenseList`**

Inside the function body (after the existing `useSignal` hooks), add:

```tsx
const { data: categoriesData } = trpc.category.listByChat.useQuery({
  chatId,
});

const categoryEmojiByExpenseId = useMemo(() => {
  const chatRows =
    categoriesData?.items
      .filter((c) => c.kind === "custom")
      .map((c) => ({
        id: c.id.replace(/^chat:/, ""),
        emoji: c.emoji,
        title: c.title,
      })) ?? [];
  const map = new Map<string, string>();
  for (const expense of expenses) {
    const resolved = resolveCategory(expense.categoryId, chatRows);
    if (resolved?.emoji) map.set(expense.id, resolved.emoji);
  }
  return map;
}, [categoriesData, expenses]);
```

- [ ] **Step 2.4: Update the inner `ExpenseCell` to accept and render `categoryEmoji`**

The inner `ExpenseCell` is defined around [VirtualizedExpenseList.tsx:340-489](../../../apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx#L340-L489). Add `categoryEmoji?: string` to its props type, destructure it, and replace the existing `before` (currently just `<Checkbox/>` at [VirtualizedExpenseList.tsx:396-408](../../../apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx#L396-L408)) with a flex container holding the checkbox and an emoji square:

```tsx
before={
  <div className="flex items-center gap-2">
    <Checkbox
      value={expense.id}
      checked={isSelected}
      onChange={(e) =>
        onExpenseToggle((prev) =>
          e.target.checked
            ? [...prev, e.target.value]
            : prev.filter((id) => id !== e.target.value)
        )
      }
    />
    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-xl leading-none">
      {categoryEmoji ?? "❓"}
    </div>
  </div>
}
```

- [ ] **Step 2.5: Pass `categoryEmoji` at the `ExpenseCell` render site inside `VirtualizedExpenseList`**

Locate where the inner `ExpenseCell` is instantiated inside the virtualizer's `rangeExtractor`/row renderer (same file). Add the `categoryEmoji` prop:

```tsx
<ExpenseCell
  expense={expense}
  // ...existing props...
  categoryEmoji={categoryEmojiByExpenseId.get(expense.id)}
/>
```

- [ ] **Step 2.6: Pass `chatId` at both call sites**

In [CreateSnapshotPage.tsx:217-221](../../../apps/web/src/components/features/Snapshot/CreateSnapshotPage.tsx#L217-L221):

```tsx
<VirtualizedExpenseList
  chatId={Number(chatId)}
  expenses={expenses}
  selectedExpenseIds={field.state.value}
  onExpenseToggle={field.handleChange}
/>
```

(`chatId` comes from `routeApi.useParams()` and is a string; convert with `Number()`.)

In [EditSnapshotPage.tsx:311-315](../../../apps/web/src/components/features/Snapshot/EditSnapshotPage.tsx#L311-L315):

```tsx
<VirtualizedExpenseList
  chatId={Number(chatId)}
  expenses={expenses}
  selectedExpenseIds={field.state.value}
  onExpenseToggle={field.handleChange}
/>
```

Verify both pages already have `chatId` in scope by checking the `useParams` destructuring near the top of each file — if they don't, add it:

```bash
grep -n "chatId" apps/web/src/components/features/Snapshot/CreateSnapshotPage.tsx apps/web/src/components/features/Snapshot/EditSnapshotPage.tsx | head -20
```

- [ ] **Step 2.7: Typecheck and lint**

```bash
pnpm turbo run typecheck --filter=web
pnpm turbo run lint --filter=web
```

Expected: both pass.

- [ ] **Step 2.8: Commit**

```bash
git add apps/web/src/components/features/Snapshot/VirtualizedExpenseList.tsx \
        apps/web/src/components/features/Snapshot/CreateSnapshotPage.tsx \
        apps/web/src/components/features/Snapshot/EditSnapshotPage.tsx
git commit -m "$(cat <<'EOF'
feat(web): show category emoji in snapshot expense picker

VirtualizedExpenseList now shows each expense's category emoji to the
right of the selection checkbox, mirroring the ChatExpenseCell pattern.
Uncategorized expenses fall back to "❓".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add category display to `ExpenseDetailsModal`

**Files:**
- Modify: `apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx`

Inside the existing "What was this for?" section, the `<Cell>` renders only the description. Add a 36×36 emoji square to its `before` slot and the category title as its `subtitle`. Props `categoryEmoji` and `categoryTitle` are threaded in from `ChatExpenseCell` (done in Task 4).

- [ ] **Step 3.1: Add the new props to `ExpenseDetailsModalProps`**

Update the interface at [ExpenseDetailsModal.tsx:93-106](../../../apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx#L93-L106):

```tsx
interface ExpenseDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: inferRouterOutputs<AppRouter>["expense"]["getExpenseByChat"][number];
  member:
    | inferRouterOutputs<AppRouter>["telegram"]["getChatMember"]
    | undefined;
  isMemberLoading: boolean;
  expenseDetails:
    | inferRouterOutputs<AppRouter>["expense"]["getExpenseDetails"]
    | undefined;
  userId: number;
  onEdit: () => void;
  categoryEmoji?: string;
  categoryTitle?: string;
}
```

And destructure in the function signature at [ExpenseDetailsModal.tsx:108-117](../../../apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx#L108-L117):

```tsx
const ExpenseDetailsModal = ({
  open,
  onOpenChange,
  expense,
  member,
  isMemberLoading,
  expenseDetails,
  userId,
  onEdit,
  categoryEmoji,
  categoryTitle,
}: ExpenseDetailsModalProps) => {
```

- [ ] **Step 3.2: Update the "What was this for?" section cell**

At [ExpenseDetailsModal.tsx:248-256](../../../apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx#L248-L256), replace the current:

```tsx
<Section header="What was this for?" className="px-3">
  <Cell
    style={{
      backgroundColor: tSectionBgColor,
    }}
  >
    <Text className="text-wrap">{expense.description}</Text>
  </Cell>
</Section>
```

With:

```tsx
<Section header="What was this for?" className="px-3">
  <Cell
    style={{
      backgroundColor: tSectionBgColor,
    }}
    before={
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-lg leading-none">
        {categoryEmoji ?? "❓"}
      </div>
    }
    subtitle={<Caption>{categoryTitle ?? "Uncategorized"}</Caption>}
  >
    <Text className="text-wrap">{expense.description}</Text>
  </Cell>
</Section>
```

Note the square is 36×36 (`size-9`) — deliberately smaller than the 44×44 (`size-11`) used on the row surfaces, so it reads as meta, not a hero element.

- [ ] **Step 3.3: Typecheck and lint**

```bash
pnpm turbo run typecheck --filter=web
pnpm turbo run lint --filter=web
```

Expected: both pass. Lint will not flag unused `categoryEmoji`/`categoryTitle` because they're referenced in the JSX above.

- [ ] **Step 3.4: Commit**

```bash
git add apps/web/src/components/features/Chat/ExpenseDetailsModal.tsx
git commit -m "$(cat <<'EOF'
feat(web): show category in expense detail modal

Renders a 36x36 emoji square and category title inside the existing
"What was this for?" section cell. Falls back to ❓ / Uncategorized
when categoryEmoji or categoryTitle isn't provided.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Thread `categoryTitle` through `ChatExpenseCell` into the detail modal

**Files:**
- Modify: `apps/web/src/components/features/Chat/VirtualizedCombinedTransactionSegment.tsx`
- Modify: `apps/web/src/components/features/Chat/ChatExpenseCell.tsx`

Currently [VirtualizedCombinedTransactionSegment.tsx:556-559](../../../apps/web/src/components/features/Chat/VirtualizedCombinedTransactionSegment.tsx#L556-L559) resolves only the emoji. Extend to also resolve the title, and thread it through `ChatExpenseCell` into `ExpenseDetailsModal`.

- [ ] **Step 4.1: Resolve both emoji and title in the transaction segment**

At [VirtualizedCombinedTransactionSegment.tsx:555-568](../../../apps/web/src/components/features/Chat/VirtualizedCombinedTransactionSegment.tsx#L555-L568), replace the existing block:

```tsx
if (transaction.type === "expense") {
  const categoryEmoji = resolveCategory(
    transaction.categoryId,
    chatRows
  )?.emoji;
  return (
    <div data-transaction-id={transaction.id} data-month-key={monthKey}>
      <ChatExpenseCell
        expense={transaction}
        sortBy={sortBy}
        categoryEmoji={categoryEmoji}
      />
    </div>
  );
}
```

With:

```tsx
if (transaction.type === "expense") {
  const resolved = resolveCategory(transaction.categoryId, chatRows);
  return (
    <div data-transaction-id={transaction.id} data-month-key={monthKey}>
      <ChatExpenseCell
        expense={transaction}
        sortBy={sortBy}
        categoryEmoji={resolved?.emoji}
        categoryTitle={resolved?.title}
      />
    </div>
  );
}
```

- [ ] **Step 4.2: Accept `categoryTitle` as a prop on `ChatExpenseCell`**

Update the props interface at [ChatExpenseCell.tsx:32-36](../../../apps/web/src/components/features/Chat/ChatExpenseCell.tsx#L32-L36):

```tsx
interface ChatExpenseCellProps {
  expense: inferRouterOutputs<AppRouter>["expense"]["getExpenseByChat"][number];
  sortBy?: "date" | "createdAt";
  categoryEmoji?: string;
  categoryTitle?: string;
}
```

Destructure it in the function signature at [ChatExpenseCell.tsx:38-42](../../../apps/web/src/components/features/Chat/ChatExpenseCell.tsx#L38-L42):

```tsx
const ChatExpenseCell = ({
  expense,
  sortBy = "date",
  categoryEmoji,
  categoryTitle,
}: ChatExpenseCellProps) => {
```

- [ ] **Step 4.3: Forward both props into `<ExpenseDetailsModal/>`**

At the `<ExpenseDetailsModal/>` render site inside `ChatExpenseCell` (around [ChatExpenseCell.tsx:344-353](../../../apps/web/src/components/features/Chat/ChatExpenseCell.tsx#L344-L353)), add the two new props:

```tsx
<ExpenseDetailsModal
  open={modalOpen}
  onOpenChange={handleModalOpenChange}
  expense={expense}
  member={member}
  isMemberLoading={isMemberLoading}
  expenseDetails={expenseDetails}
  userId={userId}
  onEdit={onEditExpense}
  categoryEmoji={categoryEmoji}
  categoryTitle={categoryTitle}
/>
```

- [ ] **Step 4.4: Typecheck and lint**

```bash
pnpm turbo run typecheck --filter=web
pnpm turbo run lint --filter=web
```

Expected: both pass.

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/src/components/features/Chat/VirtualizedCombinedTransactionSegment.tsx \
        apps/web/src/components/features/Chat/ChatExpenseCell.tsx
git commit -m "$(cat <<'EOF'
feat(web): thread category title into expense detail modal

Resolve category title alongside emoji in the transaction segment and
forward both through ChatExpenseCell into ExpenseDetailsModal so the
detail view can render the category name as a subtitle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Manual UAT in the TMA

No code changes — this task validates the three surfaces render correctly end-to-end. Per [feedback_manual_uat](../../../../.claude/projects/-Users-bubuding-code-banana-split-tma/memory/feedback_manual_uat.md): walk through one step at a time via AskUserQuestion.

**Per-surface, run through three expense states:**
1. Expense with a base category (e.g. Food)
2. Expense with a custom (chat-specific) category
3. Uncategorized expense (fallback should show `❓`; detail modal subtitle should read `"Uncategorized"`)

- [ ] **Step 5.1: Push the branch**

```bash
git push -u origin feat/category-retrofit
```

- [ ] **Step 5.2: Open a PR**

```bash
gh pr create --title "feat(web): retrofit categories on older expense surfaces" --body "$(cat <<'EOF'
## Summary

- Add category emoji to the snapshot expense list (replacing payer avatar) — matches ChatExpenseCell pattern
- Add category emoji beside the checkbox in the snapshot expense picker
- Add category emoji + title inside the "What was this for?" section of the expense detail modal
- Thread `categoryTitle` alongside the existing `categoryEmoji` through `VirtualizedCombinedTransactionSegment` → `ChatExpenseCell` → `ExpenseDetailsModal`

Spec: docs/superpowers/specs/2026-04-24-category-retrofit-older-features-design.md

## Test plan
- [ ] Open an existing snapshot and confirm each expense row shows its category emoji (base category, custom chat category, uncategorized → ❓)
- [ ] Start "Create Snapshot" and confirm the picker rows show category emoji next to the checkbox
- [ ] Start "Edit Snapshot" and confirm the picker rows show category emoji next to the checkbox
- [ ] Tap an expense in the main chat transaction list → detail modal shows emoji square + category name in "What was this for?" (and "Uncategorized" for null categoryId)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Per [feedback_auto_merge_vs_uat](../../../../.claude/projects/-Users-bubuding-code-banana-split-tma/memory/feedback_auto_merge_vs_uat.md): **do NOT arm auto-merge yet** — push the PR and wait for the user to complete UAT, then merge only after they say "ok merge".

- [ ] **Step 5.3: Walk user through UAT via AskUserQuestion**

For each of the four test-plan items above, drive one at a time. Do NOT batch.

Per [feedback_askuserquestion_style](../../../../.claude/projects/-Users-bubuding-code-banana-split-tma/memory/feedback_askuserquestion_style.md): keep option labels terse (no description text).

- [ ] **Step 5.4: If UAT passes, arm auto-merge**

```bash
gh pr merge --auto --squash --delete-branch
```

- [ ] **Step 5.5: If UAT fails, triage and iterate**

File the issue on the PR, fix on the same branch, re-run Task 5 from Step 5.3.

---

## Self-review notes

- Spec coverage: every surface in the spec has a task (Task 1: SnapshotExpenseCell · Task 2: VirtualizedExpenseList · Task 3: ExpenseDetailsModal · Task 4: threading for detail modal). Non-goals (filter modal, server-side joins) are correctly excluded.
- No placeholders; every code step shows complete code or exact commands.
- Type consistency: `categoryEmoji?: string` / `categoryTitle?: string` used uniformly across `ChatExpenseCell`, `ExpenseDetailsModal`, `SnapshotExpenseCell`, and the inner `ExpenseCell` in `VirtualizedExpenseList`.
- The `chatRows` normalisation (stripping the `chat:` prefix) is repeated in Task 1 and Task 2. It's short and the two surfaces are otherwise independent — not worth extracting a shared helper for two uses.
