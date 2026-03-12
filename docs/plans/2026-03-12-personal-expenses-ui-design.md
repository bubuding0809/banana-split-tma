# Personal Expenses UI Design

## Objective

Build a dedicated "personal expenses dashboard" for the private chat home page (the index route `/_tma/chat/`). We are abandoning the concept of a "Groups" tab. The entire private chat page will simply act as a single-page view dedicated strictly to tracking and managing personal expenses.

The previous placeholder "Add to group" logic will be removed entirely from this view.

## Constraints & Decisions

- **UI Framework**: `@telegram-apps/telegram-ui` for components (`List`, `Cell`, `Button`, etc.).
- **Location**: Refactoring `apps/web/src/components/features/Chat/UserPage.tsx` which is rendered by the `/_tma/chat/` index route.
- **Data Model**: Personal expenses are stored in a `Chat` of type `"private"` where the chat ID matches the user's Telegram ID.

## Architecture & Components

### 1. Refactoring `UserPage.tsx`

The `UserPage` will become the main dashboard for the private chat experience. It will be a clean, vertical, single-page layout (no tabs).

**Layout Structure:**

- **Profile Header**:
  - User's Avatar and Name (fetched via `initData.user`).
  - A small subtitle like "Personal Space" or "Private Expenses".
- **Primary Actions**:
  - **Snapshots Cell**: A styled `Cell` link to view expense snapshots. Reusing the existing Snapshots route (`/chat/$chatId/snapshots`), passing the user's ID as the `chatId`.
  - **Add Expense Button**: A prominent, stretched `<Button>` to quickly add a personal expense. Routes to `/chat/$chatId/add-expense` where `chatId` is the user ID.
- **Recent Transactions Area**:
  - We will render the existing `<ChatTransactionTab>` component, passing the user's ID as the `chatId`.
  - Since personal expenses are stored as standard expenses linked to the user's private `Chat` ID, this component will naturally list all personal expenses, manage pagination, and handle viewing details.

### 2. Deletions / Removals

- The "Groups" tab concept is scrapped.
- The `mainButton` logic prompting users to "Add to group" will be deleted from `UserPage`.
- The `Placeholder` with the middle-finger banana sticker will be removed.

## Data Flow & State Management

- The `chatId` used for all components is the `userId` (`tUserData.id`).
- There is no need for internal tab state or URL search parameters (`selectedTab`) since we are focusing purely on the personal dashboard.
- The `<ChatTransactionTab>` handles its own data fetching via `trpc.expense.getInfiniteExpenses`.

## Verification

- When a user opens the TMA via the private bot chat, they immediately see their personal expense dashboard.
- The "Add to group" prompt and button are nowhere to be seen.
- Clicking "Add expense" successfully navigates to the expense creation form for the user's private chat.
- The transaction list successfully queries and displays only the user's personal expenses.
