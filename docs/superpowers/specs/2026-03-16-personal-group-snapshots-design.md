# Personal Group Page Snapshots & Add Expense - Design Spec

## Overview

Currently, the personal group page (`UserPage.tsx`) lacks quick access to expense snapshots and the primary "Add expense" action button that the standard `GroupPage.tsx` features. This project will add both elements to the `UserPage` to achieve functional parity and UI consistency between personal and group spaces.

## Architecture & Components

The implementation follows a component extraction approach to keep the UI DRY and ensure consistent styling between the personal and group pages.

### 1. New Shared Components

**`SnapshotsLink` Component:**

- **Location:** `apps/web/src/components/features/Snapshot/SnapshotsLink.tsx`
- **Props:** `{ chatId: number }`
- **Responsibilities:**
  - Invokes `trpc.snapshot.getByChat.useQuery({ chatId })` to fetch the snapshot count.
  - Renders the `<Link>` wrapping a `<Cell>` component.
  - Displays the red camera `Aperture` icon and a badge with the snapshot count.
  - Handles haptic feedback on click.

**`AddExpenseButton` Component:**

- **Location:** `apps/web/src/components/features/Expense/AddExpenseButton.tsx`
- **Props:** `{ chatId: number, selectedTab: "balance" | "transaction" }`
- **Responsibilities:**
  - Retrieves `themeParams` for button colors.
  - Renders the primary `<Button>` inside a `<Link>` pointing to `/chat/$chatId/add-expense`.
  - Passes `prevTab={selectedTab}` in the search parameters.
  - Handles haptic feedback on click.

### 2. GroupPage Refactor

- Remove the hardcoded JSX for the Snapshots link and the Add Expense button from `apps/web/src/components/features/Chat/GroupPage.tsx`.
- Replace them with the newly extracted `<SnapshotsLink>` and `<AddExpenseButton>` components.
- The `snapShots` query can also be removed from `GroupPage` if it's not used anywhere else in that file.

### 3. UserPage Integration

- Add `<SnapshotsLink chatId={userId} />` immediately below the profile header in `apps/web/src/components/features/Chat/UserPage.tsx`.
- Add `<Divider />`.
- Add `<AddExpenseButton chatId={userId} selectedTab="transaction" />` below the Snapshots link.
- Add `<Divider />`.
- Since `UserPage` uses a virtualized list for transactions, the explicit height calculation on the scroll container needs to account for the new elements. To ensure reliability, we will use a `useRef` on a wrapper `div` around the newly added top sections, or calculate the remaining height securely using `calc(100vh - ${headerRef.current?.offsetHeight ?? 0}px)` where `headerRef` encompasses the entire top section.

## Data Flow

- **Snapshots:** The `chatId` passed to `trpc.snapshot.getByChat` acts dynamically. For personal spaces, the `chatId` is simply the `userId`. The backend API already supports filtering by `chatId` universally.
- **Add Expense Routing:** The route `/chat/$chatId_/add-expense` gracefully accepts the `userId` in place of the `chatId` and functions identically for personal expenses.

## Error Handling & Edge Cases

- **Loading States:** The `SnapshotsLink` will render a `<Skeleton>` badge while the tRPC query is pending, preventing UI shifts.
- **Null safety:** The `tUserData?.id` fallback of `0` ensures the UI won't crash, but queries should handle the `0` edge case smoothly if data is missing during initial load.

## Testing Strategy

- Ensure clicking "Snapshots" from the Personal Space routes to the snapshots list showing only personal snapshots.
- Ensure clicking "Add expense" routes to the correct expense creation form with `prevTab=transaction`.
- Verify the virtualized list in `UserPage` still scrolls smoothly without clipping the top or bottom items.
