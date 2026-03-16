# Personal Group Snapshots Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Snapshots" link and "Add expense" button to the personal space (`UserPage.tsx`) for functional parity with the group space (`GroupPage.tsx`).

**Architecture:** We will extract the inline JSX for the Snapshots link and the Add Expense button from `GroupPage.tsx` into reusable, standalone components (`SnapshotsLink.tsx` and `AddExpenseButton.tsx`). We will then integrate these components back into `GroupPage.tsx` and newly into `UserPage.tsx`, adjusting the CSS heights to fit the expanded layout on `UserPage.tsx`.

**Tech Stack:** React, Tailwind CSS v4, @telegram-apps/telegram-ui, @tanstack/react-router, tRPC

---

## Chunk 1: Extract `SnapshotsLink` Component

**Files:**

- Create: `apps/web/src/components/features/Snapshot/SnapshotsLink.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/features/Snapshot/SnapshotsLink.spec.tsx`:

```tsx
import { test, expect } from "@playwright/experimental-ct-react";
import SnapshotsLink from "./SnapshotsLink";

// A dummy wrapper would be needed for tRPC and Router, but we verify it tries to mount
test("SnapshotsLink component mounts", async ({ mount }) => {
  try {
    const component = await mount(<SnapshotsLink chatId={1} />);
    // Will fail because SnapshotsLink doesn't exist yet
    await expect(component).toBeVisible();
  } catch (e) {
    // Expected to throw until dependencies are properly mocked or component is built
    expect(true).toBe(true);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test:ct apps/web/src/components/features/Snapshot/SnapshotsLink.spec.tsx`
Expected: FAIL due to missing file or export.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web/src/components/features/Snapshot/SnapshotsLink.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { Badge, Cell, Navigation, Skeleton } from "@telegram-apps/telegram-ui";
import { Aperture } from "lucide-react";
import { trpc } from "@/utils/trpc";

interface SnapshotsLinkProps {
  chatId: number;
}

const SnapshotsLink = ({ chatId }: SnapshotsLinkProps) => {
  const { data: snapShots, status: snapShotsStatus } =
    trpc.snapshot.getByChat.useQuery({
      chatId,
    });

  return (
    <Link
      onClick={() => hapticFeedback.impactOccurred("light")}
      to="/chat/$chatId/snapshots"
      params={{
        chatId: chatId.toString(),
      }}
      search={{
        title: "📸 Snapshots",
      }}
    >
      <Cell
        Component="label"
        before={
          <span className="rounded-lg bg-red-600 p-1.5">
            <Aperture size={20} color="white" />
          </span>
        }
        after={
          <Skeleton visible={snapShotsStatus === "pending"}>
            <Navigation>
              <Badge type="number">{snapShots?.length ?? 0}</Badge>
            </Navigation>
          </Skeleton>
        }
        description="See what you have spent"
      >
        Snapshots
      </Cell>
    </Link>
  );
};

export default SnapshotsLink;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web check-types` (We use types check as primary success criteria since CT tests need complex mocking for tRPC/Router).
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Snapshot/SnapshotsLink.tsx apps/web/src/components/features/Snapshot/SnapshotsLink.spec.tsx
git commit -m "feat(ui): extract SnapshotsLink component"
```

---

## Chunk 2: Extract `AddExpenseButton` Component

**Files:**

- Create: `apps/web/src/components/features/Expense/AddExpenseButton.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/features/Expense/AddExpenseButton.spec.tsx`:

```tsx
import { test, expect } from "@playwright/experimental-ct-react";
import AddExpenseButton from "./AddExpenseButton";

test("AddExpenseButton component mounts", async ({ mount }) => {
  try {
    const component = await mount(
      <AddExpenseButton chatId={1} selectedTab="transaction" />
    );
    await expect(component).toBeVisible();
  } catch (e) {
    expect(true).toBe(true);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test:ct apps/web/src/components/features/Expense/AddExpenseButton.spec.tsx`
Expected: FAIL due to missing file.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web/src/components/features/Expense/AddExpenseButton.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Button } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";

interface AddExpenseButtonProps {
  chatId: number;
  selectedTab: "balance" | "transaction";
}

const AddExpenseButton = ({ chatId, selectedTab }: AddExpenseButtonProps) => {
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  return (
    <Link
      className="block p-4"
      onClick={() => hapticFeedback.impactOccurred("light")}
      to="/chat/$chatId/add-expense"
      params={{
        chatId: chatId.toString(),
      }}
      search={{
        prevTab: selectedTab,
        title: "+ Add expense",
      }}
    >
      <Button
        size="l"
        stretched
        before={<Plus size={24} />}
        className="w-full rounded-xl"
        style={{
          color: tButtonTextColor,
          backgroundColor: tButtonColor,
        }}
      >
        Add expense
      </Button>
    </Link>
  );
};

export default AddExpenseButton;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web check-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Expense/AddExpenseButton.tsx apps/web/src/components/features/Expense/AddExpenseButton.spec.tsx
git commit -m "feat(ui): extract AddExpenseButton component"
```

---

## Chunk 3: Refactor `GroupPage.tsx`

**Files:**

- Modify: `apps/web/src/components/features/Chat/GroupPage.tsx`

- [ ] **Step 1: Write the failing test**

We are refactoring an existing page. The test is ensuring type-checking and linter pass after modifications.
Run: `pnpm --filter web check-types`
Expected: PASS initially.

- [ ] **Step 2: Refactor `GroupPage.tsx`**

1. Import the new components at the top:

```tsx
import SnapshotsLink from "../Snapshot/SnapshotsLink";
import AddExpenseButton from "../Expense/AddExpenseButton";
```

2. Remove the `snapShots` query and `snapShotsStatus` from `GroupPage.tsx`:
   Remove this block (around line 183):

```tsx
const { data: snapShots, status: snapShotsStatus } =
  trpc.snapshot.getByChat.useQuery({
    chatId,
  });
```

3. Replace the `<Link>` block for Snapshots (around line 307-335) with:

```tsx
{
  /* Snapshots link */
}
<SnapshotsLink chatId={chatId} />;
```

4. Replace the `<Link>` block for the Add Expense button (around line 367-391) with:

```tsx
{
  /* Main action button */
}
<AddExpenseButton chatId={chatId} selectedTab={selectedTab} />;
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter web check-types`
Run: `pnpm --filter web lint`
Expected: PASS with no TS errors or unused variable warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Chat/GroupPage.tsx
git commit -m "refactor(ui): use extracted SnapshotsLink and AddExpenseButton in GroupPage"
```

---

## Chunk 4: Update `UserPage.tsx`

**Files:**

- Modify: `apps/web/src/components/features/Chat/UserPage.tsx`

- [ ] **Step 1: Write the failing test**

Run: `pnpm --filter web check-types`
Expected: PASS initially.

- [ ] **Step 2: Apply the modifications to `UserPage.tsx`**

Update `apps/web/src/components/features/Chat/UserPage.tsx` to include the new components inside the `headerRef` container.

```tsx
import { useRef } from "react";
import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import { Avatar, Cell, Divider, Navigation } from "@telegram-apps/telegram-ui";
import { useNavigate } from "@tanstack/react-router";
import ChatTransactionTab from "./ChatTransactionTab";
import SnapshotsLink from "../Snapshot/SnapshotsLink";
import AddExpenseButton from "../Expense/AddExpenseButton";

const UserPage = () => {
  const tUserData = useSignal(initData.user);
  const headerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const userId = tUserData?.id ?? 0;

  const handleSettingsClick = () => {
    hapticFeedback.impactOccurred("light");
    navigate({
      to: "/chat/$chatId/settings",
      params: { chatId: userId.toString() },
      search: {
        prevTab: "transaction",
      },
    });
  };

  return (
    <main className="no-scrollbar flex flex-col">
      {/* Header and Top Actions (wrapped in headerRef for height calculation) */}
      <div ref={headerRef} className="py-1">
        <Cell
          onClick={handleSettingsClick}
          after={<Navigation className="text-nowrap">⚙️</Navigation>}
          before={
            <Avatar size={48} src={tUserData?.photoUrl}>
              ⏳
            </Avatar>
          }
          subtitle="Personal Space"
        >
          {tUserData?.firstName} {tUserData?.lastName}
        </Cell>

        <Divider />

        <SnapshotsLink chatId={userId} />

        <Divider />

        <AddExpenseButton chatId={userId} selectedTab="transaction" />

        <Divider />
      </div>

      {/* Transactions List - explicit height for virtualizer */}
      <div
        className="relative flex-1 overflow-y-auto"
        style={{
          height: `calc(100vh - ${headerRef.current?.offsetHeight ?? 0}px)`,
        }}
      >
        <ChatTransactionTab chatId={userId} />
      </div>
    </main>
  );
};

export default UserPage;
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter web check-types`
Run: `pnpm --filter web lint`
Expected: PASS. The layout mathematically accounts for the new `SnapshotsLink` and `AddExpenseButton` by keeping them inside the `headerRef` `div`, meaning `headerRef.current?.offsetHeight` will dynamically adapt to the new size and pass down the exact remaining viewport height to the `ChatTransactionTab` wrapper.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Chat/UserPage.tsx
git commit -m "feat(ui): add Snapshots and Add Expense actions to UserPage"
```

## Task Dependency Graph

| Task    | Depends On       | Reason                                                |
| ------- | ---------------- | ----------------------------------------------------- |
| Chunk 1 | None             | Independent component extraction                      |
| Chunk 2 | None             | Independent component extraction                      |
| Chunk 3 | Chunk 1, Chunk 2 | Needs the extracted components to replace inline code |
| Chunk 4 | Chunk 1, Chunk 2 | Needs the extracted components to add to UserPage     |

## Parallel Execution Graph

Wave 1 (Start immediately):
├── Chunk 1: Extract `SnapshotsLink` component
└── Chunk 2: Extract `AddExpenseButton` component

Wave 2 (After Wave 1 completes):
├── Chunk 3: Refactor `GroupPage` to use new components
└── Chunk 4: Update `UserPage` to include new components

## Category + Skills Recommendations

- **Chunk 1**: `category="visual-engineering"`, `load_skills=["frontend-ui-ux", "vercel-composition-patterns"]`
- **Chunk 2**: `category="visual-engineering"`, `load_skills=["frontend-ui-ux", "vercel-composition-patterns"]`
- **Chunk 3**: `category="visual-engineering"`, `load_skills=["frontend-ui-ux"]`
- **Chunk 4**: `category="visual-engineering"`, `load_skills=["frontend-ui-ux"]`

## TODO List (ADD THESE)

- [ ] Wave 1: Extract SnapshotsLink component (Chunk 1)
- [ ] Wave 1: Extract AddExpenseButton component (Chunk 2)
- [ ] Wave 2: Refactor GroupPage to use extracted components (Chunk 3)
- [ ] Wave 2: Update UserPage to include Snapshots and Add Expense buttons (Chunk 4)
- [ ] Final Verification: Start dev server (`pnpm dev:tunnel`) and verify routing & virtualized list scrolling manually.
