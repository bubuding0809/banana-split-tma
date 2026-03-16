# Personal Expenses Design

## Objective

Allow users to track personal (non-group) expenses by reusing the existing `Expense` model. Each user gets a personal `Chat` record (type `private`, ID = user's Telegram ID) created alongside their `User` record. Personal expenses are stored as regular expenses against this chat, with the user as creator, payer, and sole participant.

## Constraints & Decisions

- **Backend only** -- no TMA/frontend UI changes. Input will come via the Telegram bot's private chat (separate repo: `bananasplit-tgbot`).
- **Reuse `Expense` model** -- no new Prisma models or schema changes.
- **No new tRPC procedures** -- the bot calls existing endpoints with `chatId = userId`.
- **No categories/tags for v1** -- just amount, description, date, currency.
- **Budgets are a near-term follow-up** -- not in scope for this design.

## Architecture

### Data Model (no schema changes)

A personal expense uses existing models as follows:

| Field                  | Value                        |
| ---------------------- | ---------------------------- |
| `Chat.id`              | User's Telegram ID (BigInt)  |
| `Chat.type`            | `"private"`                  |
| `Chat.title`           | User's `firstName`           |
| `Chat.members`         | Single member: the user      |
| `Expense.chatId`       | User's Telegram ID           |
| `Expense.creatorId`    | User's Telegram ID           |
| `Expense.payerId`      | User's Telegram ID           |
| `Expense.splitMode`    | `"EQUAL"`                    |
| `Expense.participants` | Single participant: the user |
| `ExpenseShare.userId`  | User's Telegram ID           |
| `ExpenseShare.amount`  | Full expense amount          |

### Changes to `createUser`

Modify `createUserHandler` in `packages/trpc/src/routers/user/createUser.ts` to create a personal `Chat` after the user is created:

1. After `db.user.create(...)`, call `db.chat.create(...)` with:
   - `id`: `userId` (the Telegram user ID)
   - `title`: `firstName`
   - `type`: `"private"`
   - `members`: `{ connect: { id: userId } }`
2. Do **not** create a group reminder schedule (unlike `createChat` for groups).
3. Handle the case where the chat already exists gracefully (catch unique constraint violation, log and continue).

### Backfill Migration

A one-time script to create personal `Chat` records for all existing users:

1. Query all `User` records.
2. For each user, upsert a `Chat` with `id = user.id`, `type = "private"`, `title = user.firstName`, connecting the user as a member.
3. Run as a standalone script (e.g., `packages/database/scripts/backfill-personal-chats.ts`) executed via `npx tsx`.

### API Usage by Bot

The bot creates personal expenses by calling existing tRPC procedures:

```typescript
// Create a personal expense
expense.createExpense({
  chatId: userId,
  creatorId: userId,
  payerId: userId,
  description: "Lunch",
  amount: 15.00,
  date: new Date(),
  splitMode: "EQUAL",
  participantIds: [userId],
  sendNotification: false,
  currency: "SGD",
});

// Query personal expenses
expense.getAllExpensesByChat({ chatId: userId });

// Update a personal expense
expense.updateExpense({ expenseId, chatId: userId, ... });

// Delete a personal expense
expense.deleteExpense({ expenseId, chatId: userId });
```

### Balance & Debt Calculations

No changes needed. Existing debt/balance procedures (`getDebtors`, `getCreditors`, `getSimplifiedDebts`) naturally return empty results for single-member chats since there's nobody to owe.

### Notifications

No changes needed. The bot passes `sendNotification: false` when creating personal expenses (the flag already exists). The bot handles its own confirmation messages in the private chat.

## What Does NOT Change

- Prisma schema
- tRPC procedure signatures or API surface
- Frontend/TMA code
- Balance/debt calculation logic
- Notification logic
- Settlement procedures (not applicable for personal chats)

## Components to Modify

| File                                                        | Change                                           |
| ----------------------------------------------------------- | ------------------------------------------------ |
| `packages/trpc/src/routers/user/createUser.ts`              | Add personal `Chat` creation after user creation |
| New: `packages/database/scripts/backfill-personal-chats.ts` | One-time backfill for existing users             |

## Future Extensibility

- **Categories/tags**: Add a field on `Expense` (applies to both personal and group expenses).
- **Budgets**: New `Budget` model scoped to a chat, with comparison against expenses in that chat.
- **Reporting/stats**: Query `getAllExpensesByChat` with the personal `chatId` for summaries, date-range filters, etc.

## Verification

- Creating a new user also creates a personal `Chat` with `type = "private"`.
- Running the backfill script creates personal chats for all existing users without errors.
- Calling `createExpense` with `chatId = userId` successfully creates a personal expense.
- Querying expenses by the personal `chatId` returns only that user's personal expenses.
- Debt/balance calculations for the personal chat return zeroes/empty.
