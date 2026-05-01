# Group → Supergroup Migration Reliability Fix

## Summary

Replace the bot's fragile in-memory race-condition guard for Telegram group→supergroup migrations with a self-correcting design that tolerates dropped events, cross-instance webhook routing, and concurrent migration triggers. Listen on both sides of Telegram's migration emission, make `migrateChat` idempotent under a Postgres advisory lock, extend the race-branch merge to cover all chat-scoped tables, and use a `Chat.migratedFromChatId` flag to keep welcome and migration messages from duplicating.

## Problem/Background

On 2026-05-01, the `labour day touring` group (`-5138255318`) was upgraded to a supergroup (`-1003669938174`). The expected `migrateChat` flow did not run. The new supergroup row was created from scratch by `bot_events.ts:73-80` (the `my_chat_member` → `createChat` path), leaving:

- 0 expenses, 1 ChatCategory, 11 ChatCategoryOrdering rows, 1 ExpenseSnapshot, 7 members, and an enabled AWS schedule still attached to the old chat row.
- A new chat row with default seedings (fresh `createdAt`, `threadId: 8`, fresh AWS schedule).
- Expenses had to be bulk-reinserted manually via the CLI; the snapshot, category, and old chat row were left orphaned and required SQL cleanup.

The DB state ruled out both branches of `migrateChat`: the non-race branch (`UPDATE Chat SET id = newId`) preserves the original `createdAt`, and the race-branch ends with the old chat row deleted. Neither matches what was observed. The migrate handler never ran for this chat.

### Three structural flaws this exposes

1. **Single point of failure on event delivery.** The bot listens only on the old-chat side (`message:migrate_to_chat_id`). Telegram emits the symmetric event on the new-supergroup side (`message:migrate_from_chat_id`), but the bot ignores it. If the old-side update is dropped (Telegram does not retry service messages on webhook the way it retries normal updates) or arrives during a cold start, the migration silently never happens.

2. **In-memory dedup state across separate webhook invocations.** The `migratedChatIds = new Set<number>()` lives in per-instance JavaScript heap. The bot deploys to Vercel Serverless Functions, where each webhook POST may land on a different instance. The 5-second polling guard in the `my_chat_member` handler only sees markers set on the same warm instance — across instances, the guard is ineffective.

3. **Silent error swallowing.** The `migrate_to_chat_id` handler wraps `migrateChat` in `try/catch/console.error`. Failures produce a single console line in Vercel runtime logs, with no alert, no rethrow, and short retention. We have no observability surface for migration failures.

## Solution

A four-part change set, all of which must land together for the design to be sound.

### Component 1: Symmetric Telegram listener

Add a `message:migrate_from_chat_id` handler in `apps/bot/src/features/bot_events.ts`. It calls the same `trpc.chat.migrateChat({ oldChatId, newChatId })` with the values pulled from the new-side service message. This gives us a second independent trigger for migration: if either Telegram event reaches the bot, migration runs.

```ts
botEventsFeature.on("message:migrate_from_chat_id", async (ctx) => {
  const newChatId = ctx.chat.id;
  const oldChatId = ctx.message.migrate_from_chat_id;
  await runMigration(ctx, oldChatId, newChatId);
});
```

The existing `migrate_to_chat_id` handler is rewritten to call the same shared `runMigration` helper.

### Component 2: Idempotent `migrateChat` with advisory lock

Rewrite `migrateChatHandler` in `packages/trpc/src/routers/chat/migrateChat.ts`:

1. **Acquire a Postgres transaction-scoped advisory lock** on the `newChatId` at the start of the transaction. This serializes any two concurrent migrate calls for the same target — necessary because the dual listener can produce two simultaneous calls.
   ```ts
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(${newChatId}::bigint)`;
   ```

2. **Re-read** old and new chat rows inside the lock and branch:
   - **Old chat doesn't exist:** return `{ migrated: false }` — already migrated by an earlier call. Idempotent no-op.
   - **Old chat exists, new chat doesn't:** existing raw SQL UPDATE path (`UPDATE Chat SET id = newId WHERE id = oldId`). Cascade handles all FKs. Set `migratedFromChatId = oldId` in the same transaction. Return `{ migrated: true }`.
   - **Both exist (race-branch):** explicit merge with "old wins" policy (Component 3). Return `{ migrated: true }`.

3. **Return shape changes** from `{ status, message, migratedRecords }` to add a `migrated: boolean` flag. Callers use this to decide whether to send `MIGRATION_MESSAGE_GROUP`.

### Component 3: "Old wins" race-branch merge

Extend the race-branch (existing lines 56-113) to cover every chat-scoped table. The principle: any data the user customized on the old chat overrides any defaults that `createChat` seeded on the new chat.

| Table | Action |
|---|---|
| `Expense`, `Settlement`, `ExpenseSnapshot`, `RecurringExpenseTemplate`, `ChatApiKey` | `UPDATE ... SET chatId = newId WHERE chatId = oldId` |
| `ChatCategory` | `DELETE WHERE chatId = newId` then `UPDATE ... SET chatId = newId WHERE chatId = oldId` |
| `ChatCategoryOrdering` | Same delete-then-move pattern |
| `_ChatToUser` | `connect` old members to new chat (existing behavior) |
| `Chat` (new row) | Set `migratedFromChatId = oldId` |
| `Chat` (old row) | `DELETE` (cascade clears `_ChatToUser`) |

AWS schedule reconciliation runs after the transaction commits, mirroring the non-race branch:

1. Read the schedule attached to `oldChatId` (if any).
2. Delete the default schedule that `createChat`'s `finally` block attached to `newChatId` (if it exists by now).
3. Recreate the schedule under `newChatId` using `oldChatId`'s settings.
4. Delete the `oldChatId` schedule.

### Component 4: Message-dedup via `Chat.migratedFromChatId`

Add a nullable column to the `Chat` table:

```prisma
model Chat {
  id                  BigInt   @id
  // ... existing fields
  migratedFromChatId  BigInt?
}
```

Rules:

- **`runMigration` shared helper** (in `bot_events.ts`): calls `migrateChat`, reads the returned `migrated` flag, and sends `MIGRATION_MESSAGE_GROUP` only when `migrated === true`. The idempotent no-op path (when the second event arrives after the first already migrated) stays quiet.
- **`my_chat_member` handler**: replace the in-memory guard and 5s wait with this flow:
  1. Query `getChat({ chatId })`. If it exists and `migratedFromChatId IS NOT NULL`, the chat came from a migration — skip welcome messages entirely.
  2. If it exists with `migratedFromChatId IS NULL`, the bot was previously added — skip welcome messages (re-add).
  3. If it doesn't exist, call `createChat` and send `GROUP_JOIN_MESSAGE` + `GROUP_INSTRUCTION`.
- **`createChat`** becomes upsert-safe: catch the unique-constraint conflict and return the existing row. This avoids races between concurrent `my_chat_member` and migrate handlers.
- **`createGroupReminderScheduleHandler`** becomes idempotent: if a schedule already exists for the chat, no-op. This handles the case where `createChat`'s `finally` block runs after migration has already replaced the schedule.

### Component 5: Stop swallowing migration errors

In both Telegram event handlers, remove the bare `try/catch/console.error` around the migrate call. Let errors propagate to grammy's `bot.catch` handler in `apps/bot/src/bot.ts`, which logs structurally with the update ID. Vercel runtime logs will surface the failure with enough context to trace.

## Impact

**Positive:**
- Migrations complete reliably regardless of which Telegram event arrives, which Vercel instance handles it, or whether either event is briefly delayed.
- Concurrent triggers (the typical case under the new dual listener) are serialized cleanly.
- Race-branch now preserves all user customizations on the old chat (categories, ordering, AWS schedule, recurring templates, API keys).
- Failed migrations surface in logs instead of disappearing.

**Risk:**
- **Schema migration**: adding `migratedFromChatId` is additive (nullable); no backfill needed.
- **AWS schedule reconciliation under failure**: if the post-transaction schedule reconciliation fails (e.g., AWS credential issue), the new chat may end up with the default schedule instead of the old chat's. Existing non-race branch already swallows this with a `console.error`; the new code keeps that behavior. Acceptable — schedule settings are user-recoverable via the settings UI.
- **Edge case: welcome + migration message both sent.** When `my_chat_member` lands on the new supergroup before either migration event is processed, the user sees `GROUP_JOIN_MESSAGE` + `GROUP_INSTRUCTION` followed shortly after by `MIGRATION_MESSAGE_GROUP`. Each message is technically correct in context. Closing this fully would require a short DB-poll in `my_chat_member` for supergroups; deferred as out of scope per UAT decision.

## Behavior table

| Ordering | What runs | User-visible messages |
|---|---|---|
| migrate_to first, then my_chat_member, then migrate_from | `migrateChat` (Branch B raw UPDATE) → my_chat_member sees `migratedFromChatId` set, skips welcome → second migrate is no-op | 1× migration message |
| my_chat_member first, then migrate_to | createChat creates row + sends welcome → migrate runs race-branch, sends migration message | welcome + migration (acceptable per scope) |
| Concurrent migrate_to + migrate_from | Both call migrateChat; advisory lock serializes; first does work, second is no-op | 1× migration message |
| Pure fresh supergroup add (no migration event) | my_chat_member creates row, sends welcome | welcome only |
| Bot kicked then re-added | my_chat_member finds existing row, skips welcome | nothing |

## Out of scope

The following were considered and explicitly deferred:

- **Admin recovery slash command** (`/migrate <oldChatId>`): would let admins trigger migration manually if both Telegram events were missed. Per scope decision ("Root cause only"), this is not needed — the dual listener should make this scenario vanishingly rare. Can be added later if monitoring shows residual failures.
- **Alerting on migration failure**: surfacing failures via Sentry/PagerDuty/Slack rather than just Vercel logs. Out of scope; current console-based logging via `bot.catch` is the agreed minimum.
- **Heuristic post-hoc migration** (member overlap, title similarity): brittle, deferred indefinitely.
- **Closing the welcome+migration edge case** with a DB-poll in `my_chat_member`: explicitly accepted per scope decision.

## Testing

- [ ] **Unit / handler-level**:
  - `migrateChat` returns `{ migrated: true }` when running Branch B (fresh new chat).
  - `migrateChat` returns `{ migrated: true }` when running race-branch (both exist).
  - `migrateChat` returns `{ migrated: false }` when called with a non-existent old chat.
  - Race-branch correctly moves all 7 chat-scoped tables and sets `migratedFromChatId`.
  - Race-branch correctly replaces the new chat's default ChatCategory + ChatCategoryOrdering with old's.
  - `createChat` returns existing row on unique-conflict instead of throwing.
  - `createGroupReminderScheduleHandler` no-ops when schedule exists.
- [ ] **Concurrency**:
  - Two `migrateChat` calls in parallel for the same chat pair complete without DB inconsistency (one does work, one no-ops).
- [ ] **Manual UAT** (subagent-driven where possible, manual via Telegram for visible UX):
  - Create a real group with the bot, add expenses + customize category + create snapshot.
  - Upgrade to supergroup. Verify: data on new chat ID, no orphan rows, exactly one migration message in chat, AWS schedule transferred.
  - Repeat with bot offline during upgrade (simulate by pausing webhook), bring online, verify migration completes once both events arrive (or the new-side event arrives via the message handler).
  - Fresh supergroup creation (Telegram allows direct supergroup creation without prior group): verify welcome message fires, no migration message.
  - Bot kick + re-add to existing chat: verify no welcome message, no duplicate seeding.

## Open questions

None — all design decisions confirmed during brainstorming on 2026-05-01.
