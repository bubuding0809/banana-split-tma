# Personal Expenses UI Design

## Overview

We are building a user interface to display "personal expenses" on the home page of the Banana Split TMA. Currently, the root `chat` index page (when accessed via a private chat with the bot) displays a `UserPage` placeholder component encouraging the user to "Add to group".

Following the user's requirement, we will replace this placeholder with a functional dashboard. The layout will be a **tabbed interface** (similar to the Balances / Transactions tabs in the `GroupPage`), with two tabs:

1. **Personal** - To show the user's personal expenses and snapshots.
2. **Groups** - To display the user's groups (which we will keep as a placeholder/list for future expansion, or just point them to how to add the bot to groups). We will remove the large persistent "Add to group" button from the main view to focus on personal finance.

## Constraints & Decisions

- **UI Framework**: `@telegram-apps/telegram-ui` for components (TabsList, List, Cell, etc.).
- **Location**: `apps/web/src/components/features/Chat/UserPage.tsx`. We will refactor this component.
- **Data Model**: Personal expenses are stored in a `Chat` of type `"private"` where the chat ID matches the user's Telegram ID.
- **Tab State**: We will use search parameters to manage the tab state (`?selectedTab=personal|groups`), similar to `GroupPage`.

## Architecture & Components

### 1. Route Changes

Update `apps/web/src/routes/_tma/chat.index.tsx` to handle the `selectedTab` search parameter so we can deep link into tabs.

### 2. Refactoring `UserPage.tsx`

The `UserPage` will become the main container for the private chat experience.

**Layout Structure:**

- **Header Section**: User's Avatar and Name (fetched via `initData.user`).
- **Tab List**: `TabsList` component from `@telegram-apps/telegram-ui`.
  - Tab 1: "Personal" (Icon: `User` or `Wallet`)
  - Tab 2: "Groups" (Icon: `Users`)
- **Tab Content Area**:
  - If `selectedTab === 'personal'`: Render `<PersonalTab />`
  - If `selectedTab === 'groups'`: Render `<GroupsTab />`

### 3. `<PersonalTab />` Component

This new component will display the personal financial dashboard.

**Features:**

- **Snapshots Cell**: A link to view expense snapshots (using the existing `Snapshots` route, passing the user's ID as the `chatId`).
- **Add Expense Button**: A large primary button to quickly add a personal expense (routes to `/chat/$chatId/add-expense` where `chatId` is the user ID).
- **Recent Transactions Segment**: We can reuse the existing `<ChatTransactionTab>` component, passing the user's ID as the `chatId`. Since personal expenses are just expenses in a private chat, the existing transaction tab should work out of the box to list the expenses!

### 4. `<GroupsTab />` Component

For now, this will house the current "Add me to a group" placeholder and the logic to show the "Add to group" Telegram main button. This keeps the functionality accessible without cluttering the personal expense view.

## Data Flow

- The `chatId` for all personal expense operations is the `userId` (`tUserData.id`).
- We can fetch the user's personal chat data using `trpc.chat.getChat.useQuery({ chatId: userId })`.
- If the chat doesn't exist yet (for older users who haven't been backfilled, though the backend design handles this), we should degrade gracefully.

## Error Handling & Loading States

- Use `<Spinner />` and `<Skeleton />` while fetching the personal chat details or transactions.
- Wrap the tabs in Suspense/Error boundaries as needed, following the existing `GroupPage` pattern.

## Verification

- Opening the TMA in the bot's private chat defaults to the "Personal" tab.
- The "Personal" tab shows the user's personal expenses (via `ChatTransactionTab`).
- Clicking "Add expense" routes to the add expense form for the personal chat.
- Switching to the "Groups" tab shows the "Add to group" placeholder.
