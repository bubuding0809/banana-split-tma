# Personal Expenses UI Design

## Objective

Build a dedicated "personal expenses dashboard" for the private chat home page (the index route `/_tma/chat/`).

To accommodate future features, we will use a **tabbed layout** with "Personal" and "Groups" tabs. However, the "Groups" tab will be disabled (non-interactive) for now to indicate it is "coming soon". The "Personal" tab will act as the primary dashboard.

The previous placeholder "Add to group" logic will be removed entirely from this view.

## Constraints & Decisions

- **UI Framework**: `@telegram-apps/telegram-ui` for components (`TabsList`, `List`, `Cell`, `Button`, etc.).
- **Location**: Refactoring `apps/web/src/components/features/Chat/UserPage.tsx` which is rendered by the `/_tma/chat/` index route.
- **Data Model**: Personal expenses are stored in a `Chat` of type `"private"` where the chat ID matches the user's Telegram ID.

## Architecture & Components

### 1. Refactoring `UserPage.tsx`

The `UserPage` will become the main dashboard for the private chat experience. It will be a clean, vertical layout with a disabled tab for future expansion.

**Proposed Layout:**

```text
+--------------------------------------------------+
|                                                  |
|  [ Avatar ]   User's Full Name                   |
|               Personal Space                     |
|                                                  |
+--------------------------------------------------+
|                                                  |
|   [ Wallet Icon ]          [ Users Icon ]        |
|     Personal                 Groups              |
|   (Selected)               (Disabled)            |
|                                                  |
+--------------------------------------------------+
| Transactions                                     |
|                                                  |
|  +--------------------------------------------+  |
|  | [Icon]   Lunch                   - SGD 12  |  |
|  |          Today, 1:00 PM                    |  |
|  +--------------------------------------------+  |
|                                                  |
|  +--------------------------------------------+  |
|  | [Icon]   Coffee                  - SGD  5  |  |
|  |          Yesterday, 9:00 AM                |  |
|  +--------------------------------------------+  |
|                                                  |
|  +--------------------------------------------+  |
|  | [Icon]   Groceries               - SGD 40  |  |
|  |          Mar 10, 6:00 PM                   |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
```

**Layout Structure:**

- **Profile Header**:
  - User's Avatar and Name (fetched via `initData.user`).
  - A small subtitle like "Personal Space".
- **Tabs Component**:
  - Reusing `TabsList` from `@telegram-apps/telegram-ui`.
  - Tab 1: "Personal" (Selected by default).
  - Tab 2: "Groups" (Disabled state).
- **Recent Transactions Area (Personal Tab)**:
  - We will render the existing `<ChatTransactionTab>` component, passing the user's ID as the `chatId`.
  - Since personal expenses are stored as standard expenses linked to the user's private `Chat` ID, this component will naturally list all personal expenses, manage pagination, and handle viewing details.

### 2. Deletions / Removals

- The `mainButton` logic prompting users to "Add to group" will be deleted from `UserPage`.
- The `Placeholder` with the middle-finger banana sticker will be removed.

## Data Flow & State Management

- The `chatId` used for all components is the `userId` (`tUserData.id`).
- There is no need for internal tab state or URL search parameters (`selectedTab`) yet since the "Groups" tab is disabled and cannot be navigated to. The "Personal" tab is always rendered.
- The `<ChatTransactionTab>` handles its own data fetching via `trpc.expense.getInfiniteExpenses`.

## Verification

- When a user opens the TMA via the private bot chat, they immediately see their personal expense dashboard.
- The "Groups" tab is visible but greyed out/disabled, and clicking it does nothing.
- The "Add to group" prompt and button are nowhere to be seen.
- Clicking "Add expense" successfully navigates to the expense creation form for the user's private chat.
- The transaction list successfully queries and displays only the user's personal expenses.
