# Recurring Expense Notification Distinction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Where the design intersects shared deep-link infrastructure, use **superpowers:test-driven-development** — these tasks are marked `[TDD]`.

**Goal:** Render a 🔁 footer line and a second `View Schedule` inline button on Telegram expense notifications that originated from a `RecurringExpenseTemplate`, with a new `rt` deep-link entity targeting the per-template edit screen. Zero regressions on existing deep links (`e`, `s`, `p`, `c`).

**Spec:** `docs/superpowers/specs/2026-05-15-recurring-expense-notification-distinction-design.md`

**Branch:** `feat/recurring-expense-notification-distinction` (already created off `main`).

---

## File structure

**Modify:**
- `packages/trpc/src/utils/deepLinkProtocol.ts` — extend `entityType` union with `"rt"`.
- `packages/trpc/src/utils/deepLinkProtocol.spec.ts` — lock existing entities + add `rt` round-trip.
- `apps/web/src/hooks/useStartParams.ts` — extend zod enum and TS type with `"rt"`.
- `apps/web/src/hooks/useStartParams.spec.ts` — add `rt` parse test.
- `apps/web/src/routes/_tma/chat.$chatId.tsx` — add `rt` branch navigating to edit-recurring.
- `packages/trpc/src/routers/telegram/sendExpenseNotificationMessage.ts` — input schema, `formatExpenseMessage`, keyboard builder.
- `packages/trpc/src/routers/expense/createExpense.ts` — forward `recurringTemplateId` to notification.
- The edit-expense handler — same forwarding (path TBD in Task 5).

**No schema change.** No new files needed.

---

## Task 1 [TDD] — Lock existing deep-link entity round-trips

The current spec file only tests `s`. Before adding `rt`, lock `e`, `p`, `c` so we can prove the change is additive.

**Files:** `packages/trpc/src/utils/deepLinkProtocol.spec.ts`

- [ ] **Step 1.1:** Read current tests in `deepLinkProtocol.spec.ts` to confirm shape.
- [ ] **Step 1.2:** Add `it("encodes and decodes 'e' (expense) entity round-trip")` — random valid UUID, chatId `-1001234567890`, chat_type `g`. Assert encoded payload starts with `v1_g_` and contains `_e_`, decoded fields match.
- [ ] **Step 1.3:** Add `it("encodes and decodes 'p' (profile) entity round-trip")` — same shape, chat_type `p`.
- [ ] **Step 1.4:** Add `it("encodes and decodes 'c' (counterparty) entity round-trip")`.
- [ ] **Step 1.5:** Add `it("decodes payloads without an entity (chat-only)")` — `v1_g_<chatId>` only; result has no `entity_type`/`entity_id`.
- [ ] **Step 1.6:** Add `it("returns null for malformed payloads")` covering: missing `v1_` prefix, wrong segment count (4 segments), empty string, random garbage.
- [ ] **Step 1.7:** Run `pnpm --filter @dko/trpc test deepLinkProtocol` (or repo-wide vitest). All new tests must pass against unchanged code. **Do not edit `deepLinkProtocol.ts` yet.**

**Verification:** test output shows all entity-type tests green; no source change in this task.

---

## Task 2 [TDD] — Add `rt` entity to the encoder

**Files:** `packages/trpc/src/utils/deepLinkProtocol.ts`, `packages/trpc/src/utils/deepLinkProtocol.spec.ts`

- [ ] **Step 2.1:** Write a failing test `it("encodes and decodes 'rt' (recurring template) entity round-trip")`. Use a real-shaped UUID like `123e4567-e89b-12d3-a456-426614174000`. Assert encoded form matches `/^v1_g_[A-Za-z0-9-]+_rt_[A-Za-z0-9]+$/` and decode returns `entity_type: "rt"`, same `entity_id`.
- [ ] **Step 2.2:** Run the test — it must fail at the type-check or runtime stage (the encoder union currently only accepts `"s" | "e" | "p" | "c"`).
- [ ] **Step 2.3:** Edit `encodeV1DeepLink` signature (line 13) to add `"rt"` to the union: `entityType?: "s" | "e" | "p" | "c" | "rt"`. The body needs no other change — `payload += \`_${entityType}_${uuidStr}\`` already handles multi-char entity types.
- [ ] **Step 2.4:** Check `decodeV1DeepLink` — line 36 splits on `_`; with `rt`, `v1_g_<chat>_rt_<id>` still splits into 5 segments. No code change needed. Verify by re-reading lines 32–77.
- [ ] **Step 2.5:** Run tests. All Task-1 tests must remain green; new `rt` test now green.

**Verification:** `pnpm --filter @dko/trpc test deepLinkProtocol` — all 7+ tests pass. Diff on `deepLinkProtocol.ts` is a single-line union extension.

---

## Task 3 [TDD] — Extend TMA start_param parser for `rt`

**Files:** `apps/web/src/hooks/useStartParams.ts`, `apps/web/src/hooks/useStartParams.spec.ts`

- [ ] **Step 3.1:** Read `useStartParams.spec.ts` to understand the existing mock harness.
- [ ] **Step 3.2:** Add `it("parses 'rt' entity from v1 payload")`. Extend the `vi.mock` for `decodeV1DeepLink` with a new branch returning `{ chat_id: "-1001234567890", chat_type: "g", entity_type: "rt", entity_id: "<uuid>" }`. Assert `parseRawParams("<that-payload>")` returns the same shape.
- [ ] **Step 3.3:** Run the test — must fail (`startParamSchema` enum rejects `"rt"`).
- [ ] **Step 3.4:** Edit `useStartParams.ts`:
  - Line 8 (zod): `entity_type: z.enum(["s", "e", "p", "c", "rt"]).optional()`.
  - Line 15 (TS): `entity_type?: "s" | "e" | "p" | "c" | "rt"`.
- [ ] **Step 3.5:** Run all `useStartParams` tests — every existing test green, new test green.

**Verification:** `pnpm --filter web test useStartParams`.

---

## Task 4 [TDD] — Add `rt` routing branch in chat route

The TMA navigates entity deep links from `apps/web/src/routes/_tma/chat.$chatId.tsx`. Existing branches: `entity_type === "s"` → snapshots, `entity_type === "e"` → transaction tab.

**Files:** `apps/web/src/routes/_tma/chat.$chatId.tsx`, `apps/web/src/routes/_tma/chat.$chatId.test.tsx` (existing test file).

- [ ] **Step 4.1:** Read `chat.$chatId.test.tsx` to understand the existing routing-test harness (mock for `useStartParams`, `useNavigate`, etc.).
- [ ] **Step 4.2:** Add a failing test asserting: when `startParams.entity_type === "rt"` and `entity_id` is set, `navigate` is called with `{ to: "/chat/$chatId/edit-recurring/$templateId", params: { chatId, templateId: entity_id }, replace: true }`. Also assert the `deep_link_consumed_<id>` sessionStorage key is set so re-entry doesn't loop.
- [ ] **Step 4.3:** Run — must fail (branch not implemented).
- [ ] **Step 4.4:** In `chat.$chatId.tsx`, after the `entity_type === "e"` block (around line 81), add the mirror `rt` block. Mirror the existing structure exactly: sessionStorage idempotency guard, then `navigate({ to: "/chat/$chatId/edit-recurring/$templateId", ... replace: true })`. Add `startParams?.entity_type === "rt" && startParams?.entity_id`.
- [ ] **Step 4.5:** Run all tests in the file — existing `s` and `e` branch tests must still pass.

**Verification:** `pnpm --filter web test chat.\$chatId`. Manual sanity: type-check passes (`pnpm --filter web typecheck`).

---

## Task 5 — Plumb `recurringTemplateId` into the notification sender

**Files:** `packages/trpc/src/routers/telegram/sendExpenseNotificationMessage.ts`

- [ ] **Step 5.1:** Read the file end-to-end to confirm the input zod schema location (around L37–75), `formatExpenseMessage` (L94–177), and keyboard build inside `sendExpenseNotificationMessageHandler` (L179–255 region, especially L225–236 where the deep link is built).
- [ ] **Step 5.2:** Add `recurringTemplateId: z.string().uuid().nullish()` to the input schema.
- [ ] **Step 5.3:** In `formatExpenseMessage`, after the splits block is composed, append:
  ```ts
  if (input.recurringTemplateId) {
    lines.push("");
    lines.push("> 🔁 Auto-created from a recurring schedule");
  }
  ```
  Use the exact blockquote `>` prefix — Telegram renders it as an indented quote in HTML/Markdown parse modes. Verify which parse mode is currently used (search for `parse_mode` in the sender) and confirm `>` blockquote syntax is supported in that mode; if the file uses HTML mode, wrap the line in `<blockquote>...</blockquote>` instead. Pick whichever matches existing usage.
- [ ] **Step 5.4:** In the keyboard builder, where the single `View Expense` button is created (~L225–236), branch:
  ```ts
  const buttons: InlineKeyboardButton[] = [
    { text: "View Expense", url: viewExpenseUrl },
  ];
  if (input.recurringTemplateId) {
    const schedPayload = encodeV1DeepLink(
      BigInt(input.chatId),
      chatType,
      "rt",
      input.recurringTemplateId,
    );
    const viewScheduleUrl = createDeepLinkedUrl(botInfo.username, schedPayload, "app");
    buttons.push({ text: "View Schedule", url: viewScheduleUrl });
  }
  reply_markup: { inline_keyboard: [buttons] }
  ```
- [ ] **Step 5.5:** Type-check `pnpm --filter @dko/trpc typecheck`. If any spec exists for this file, run it and update.

**Verification:** No unit-test coverage exists for the full message body today, so verification here is type-check + manual UAT in later tasks.

---

## Task 6 — Forward `recurringTemplateId` from `createExpenseHandler`

**Files:** `packages/trpc/src/routers/expense/createExpense.ts`

- [ ] **Step 6.1:** Open `createExpense.ts` and locate the call to `sendExpenseNotificationMessageHandler` (around L441–468 per the earlier survey).
- [ ] **Step 6.2:** Confirm the handler's input already includes `recurringTemplateId` (it must, since it sets `Expense.recurringTemplateId`). If yes, pass `recurringTemplateId: input.recurringTemplateId ?? null` to the notification call. If the handler reads it from the created expense row instead, pass `recurringTemplateId: createdExpense.recurringTemplateId ?? null` — single source of truth is the DB row.
- [ ] **Step 6.3:** Type-check.

**Verification:** Type-check passes; no caller of `createExpenseHandler` needs to change (manual creates pass `undefined`, lambda creates pass the template id — both already pass through).

---

## Task 7 — Forward `recurringTemplateId` from the edit-expense path

**Files:** TBD — find the edit-expense handler that re-renders the notification.

- [ ] **Step 7.1:** Grep for callers of `sendExpenseNotificationMessageHandler` in `packages/trpc/src/routers/expense/`. There should be at least one edit-expense / update-expense handler that re-sends or edits the Telegram message.
- [ ] **Step 7.2:** In each such caller, load `expense.recurringTemplateId` from the DB row (it persists across edits) and forward it the same way as Task 6.
- [ ] **Step 7.3:** Type-check.

**Verification:** Type-check passes. If a spec exists for the edit-expense handler, run it.

---

## Task 8 — Local smoke test before push

- [ ] **Step 8.1:** Run repo-wide tests: `pnpm test`. All green, including the new ones.
- [ ] **Step 8.2:** Run type-check across affected packages: `pnpm --filter @dko/trpc typecheck && pnpm --filter web typecheck`.
- [ ] **Step 8.3:** Run lint if configured: `pnpm lint`. Fix any new warnings.
- [ ] **Step 8.4:** Visually grep the diff: `git diff main -- packages/trpc/src/utils/deepLinkProtocol.ts apps/web/src/hooks/useStartParams.ts apps/web/src/routes/_tma/chat.\$chatId.tsx`. Diffs must be additive only (no existing-entity behaviour changed).

---

## Task 9 — Commit, push, open PR

Per `feedback_pr_flow`: branch + PR + `gh pr merge --auto --squash --delete-branch`, but **hold auto-merge until UAT** (per `feedback_auto_merge_vs_uat`).

- [ ] **Step 9.1:** Commit with conventional format. Suggested message:
  ```
  feat(notifications): distinguish recurring expense notifications

  - Footer blockquote on auto-fired expense messages
  - Second inline button: View Schedule → edit-recurring deep link
  - New `rt` deep-link entity (additive; existing entities locked by tests)
  ```
- [ ] **Step 9.2:** Push branch.
- [ ] **Step 9.3:** `gh pr create` with summary referencing the spec URL.
- [ ] **Step 9.4:** Tag `@claude` on the PR with a merge-readiness ask (per `feedback_pr_oc_review`). Do not arm auto-merge yet.

---

## Task 10 — UAT (manual, after Vercel deploy of the PR preview if available, otherwise after merge to main)

Per `feedback_recurring_uat_lambda_fire`: form-submit + DB audit is not enough; we must fire the lambda manually.

- [ ] **Step 10.1:** Create a recurring expense in a test chat via the TMA.
- [ ] **Step 10.2:** Verify the **first occurrence** notification has the 🔁 footer and both buttons.
- [ ] **Step 10.3:** Tap `View Expense` — lands on transaction tab with expense modal open (regression check).
- [ ] **Step 10.4:** Tap `View Schedule` — lands on `/chat/<chatId>/edit-recurring/<templateId>` (new behaviour).
- [ ] **Step 10.5:** `aws lambda invoke` the scheduled execution to fire the next occurrence. Verify the new notification has the same footer + buttons.
- [ ] **Step 10.6:** Edit the recurring-origin expense amount in TMA. Verify the updated notification preserves the footer and both buttons.
- [ ] **Step 10.7:** Create a plain manual expense in the same chat. Verify only one button, no footer (regression check).
- [ ] **Step 10.8 — Deep-link regression (mandatory):**
  - Tap `View Expense` on a **pre-deploy** notification still in chat history. Must land on the same screen.
  - Open a snapshot share URL. Must resolve unchanged.
  - Open a counterparty deep link (from cross-group balances or a nudge DM). Must resolve unchanged.
  - **If any of these fail: revert before troubleshooting** per spec.

---

## Task 11 — Arm auto-merge

- [ ] **Step 11.1:** Only after the user confirms UAT passes ("ok merge"), run `gh pr merge <PR#> --auto --squash --delete-branch`.

---

## Notes for the implementer

- The encoder's wire format is **frozen** for existing entities. Any test red on `s`/`e`/`p`/`c` is a stop-the-line event.
- The blockquote prefix `>` is Telegram MarkdownV2; if the sender uses HTML parse mode, use `<blockquote>` instead. Pick by inspection of the existing `parse_mode` in `sendExpenseNotificationMessage.ts`.
- `RecurringExpenseTemplate.status === "ENDED"` templates still get linked — edit-recurring route already handles read-only state.
- The 🔁 emoji matches the lucide `Repeat` icon used in `RecurringExpenseBadge.tsx` and `RecurrencePickerSheet.tsx`.
