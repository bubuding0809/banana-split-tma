# Personal Expenses UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a personal expenses dashboard on the TMA home page (private chat) with a tabbed interface separating "Personal" expenses from "Groups" (which retains the "Add to group" prompt).

**Architecture:** We will refactor the existing `UserPage` to be a tabbed container. The "Personal" tab will reuse the `ChatTransactionTab` component (passing the user's ID as the `chatId`). The "Groups" tab will contain the existing "Add to group" UI. We will also update the root route `_tma/chat.index.tsx` to handle the `selectedTab` search parameter.

**Tech Stack:** React, `@tanstack/react-router`, `@telegram-apps/sdk-react`, `@telegram-apps/telegram-ui`, Tailwind CSS.

---

### Task 1: Update Route Definitions for Tabs

**Files:**

- Modify: `apps/web/src/routes/_tma/chat.index.tsx`

**Step 1: Add search parameters to route**

We need to allow `selectedTab` in the route's search parameters, defaulting to `'personal'`.

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { UserPage } from "@/components/features";

const searchSchema = z.object({
  selectedTab: z.enum(["personal", "groups"]).optional().catch("personal"),
});

export const Route = createFileRoute("/_tma/chat/")({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  return <UserPage />;
}
```

**Step 2: Run type check**

Run: `turbo run check-types --filter=web`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/routes/_tma/chat.index.tsx
git commit -m "feat(ui): add search params to chat index route for tabs"
```

---

### Task 2: Refactor UserPage to support Tabs

**Files:**

- Modify: `apps/web/src/components/features/Chat/UserPage.tsx`

**Step 1: Restructure UserPage layout**

Rewrite the component to use `TabsList` and handle the `selectedTab` search parameter. Move the existing "Add to group" logic into a separate `GroupsTab` component (or just conditionally render it for now).

```tsx
import {
  hapticFeedback,
  initData,
  mainButton,
  openTelegramLink,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Caption,
  Cell,
  Divider,
  Placeholder,
  TabsList,
  Text,
} from "@telegram-apps/telegram-ui";
import { getRouteApi } from "@tanstack/react-router";
import { Users, Wallet } from "lucide-react";
import { useEffect, useRef } from "react";

import { assetUrls } from "@/assets/urls";
import ChatTransactionTab from "./ChatTransactionTab";

const routeApi = getRouteApi("/_tma/chat/");

const UserPage = () => {
  const { selectedTab } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const tUserData = useSignal(initData.user);

  const userId = tUserData?.id ?? 0;

  const handleTabChange = (tab: "personal" | "groups") => {
    hapticFeedback.selectionChanged();
    navigate({
      search: (prev) => ({
        ...prev,
        selectedTab: tab,
      }),
    });
  };

  return (
    <main className="no-scrollbar flex h-screen flex-col bg-neutral-50 dark:bg-neutral-900/20">
      {/* Header */}
      <div className="flex items-center gap-3 bg-white px-4 py-2 dark:bg-black">
        <Avatar size={48} src={tUserData?.photoUrl} />
        <div>
          <Text weight="2" className="block">
            {tUserData?.firstName} {tUserData?.lastName}
          </Text>
          <Caption level="1" className="text-gray-500">
            Personal Space
          </Caption>
        </div>
      </div>

      <Divider />

      {/* Tabs */}
      <div className="bg-white px-4 pt-2 dark:bg-black">
        <TabsList>
          <TabsList.Item
            onClick={() => handleTabChange("personal")}
            selected={selectedTab === "personal"}
          >
            <div className="flex items-center justify-center gap-1">
              <Wallet size={16} />
              <Text weight={selectedTab === "personal" ? "2" : "3"}>
                Personal
              </Text>
            </div>
          </TabsList.Item>
          <TabsList.Item
            onClick={() => handleTabChange("groups")}
            selected={selectedTab === "groups"}
          >
            <div className="flex items-center justify-center gap-1">
              <Users size={16} />
              <Text weight={selectedTab === "groups" ? "2" : "3"}>Groups</Text>
            </div>
          </TabsList.Item>
        </TabsList>
      </div>

      <Divider />

      {/* Content */}
      <div className="relative flex-1 overflow-y-auto">
        {selectedTab === "personal" && <PersonalTab userId={userId} />}
        {selectedTab === "groups" && <GroupsTab />}
      </div>
    </main>
  );
};

// ... (Subcomponents to be implemented in next step)

export default UserPage;
```

**Step 2: Run linter**

Run: `turbo run lint --filter=web`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/features/Chat/UserPage.tsx
git commit -m "feat(ui): implement tab layout in user page"
```

---

### Task 3: Implement PersonalTab and GroupsTab

**Files:**

- Modify: `apps/web/src/components/features/Chat/UserPage.tsx`

**Step 1: Add subcomponents**

Add the implementation for `PersonalTab` and `GroupsTab` at the bottom of the file (or in the same file to keep it simple).

```tsx
import { Link } from "@tanstack/react-router";
import { Plus, Aperture } from "lucide-react";
import { Button, Navigation, themeParams } from "@telegram-apps/telegram-ui";

// ... existing UserPage code ...

function PersonalTab({ userId }: { userId: number }) {
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  return (
    <div className="flex flex-col pb-20">
      {/* Snapshots link */}
      <Link
        className="block"
        onClick={() => hapticFeedback.impactOccurred("light")}
        to="/chat/$chatId/snapshots"
        params={{ chatId: userId.toString() }}
        search={{ title: "📸 Snapshots" }}
      >
        <Cell
          Component="div"
          before={
            <span className="rounded-lg bg-red-600 p-1.5">
              <Aperture size={20} color="white" />
            </span>
          }
          after={<Navigation />}
          description="See what you have spent"
        >
          Snapshots
        </Cell>
      </Link>

      <Divider />

      {/* Add Expense Button */}
      <Link
        className="block p-4"
        onClick={() => hapticFeedback.impactOccurred("light")}
        to="/chat/$chatId/add-expense"
        params={{ chatId: userId.toString() }}
        search={{ prevTab: "personal", title: "+ Add expense" }}
      >
        <Button
          size="l"
          stretched
          before={<Plus size={24} />}
          className="rounded-xl"
          style={{
            color: tButtonTextColor,
            backgroundColor: tButtonColor,
          }}
        >
          Add personal expense
        </Button>
      </Link>

      {/* Transactions List */}
      <div className="mt-2">
        <ChatTransactionTab chatId={userId} />
      </div>
    </div>
  );
}

function GroupsTab() {
  const isMainButtonMounted = useSignal(mainButton.isMounted);

  useEffect(() => {
    mainButton.setParams.ifAvailable({
      text: "+ Add to group",
      isEnabled: true,
      isVisible: true,
    });

    const offMainButtonClick = mainButton.onClick.ifAvailable(() => {
      openTelegramLink(
        `${import.meta.env.VITE_TELEGRAM_BOT_DEEP_LINK}?startgroup=group_add`
      );
    });

    return () => {
      offMainButtonClick?.();
      mainButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
    };
  }, [isMainButtonMounted]);

  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <Placeholder
        header="Nothing to see here, for now ..."
        description="Add me to a group to start splitting expenses"
      >
        <img
          alt="Telegram sticker"
          src={assetUrls.bananaMiddleFinger}
          style={{ display: "block", height: "144px", width: "144px" }}
        />
      </Placeholder>
    </div>
  );
}
```

_Note: Update the `UserPage` component to hide the `mainButton` if `selectedTab` is not `"groups"`. The `GroupsTab` handles showing the button, but we should ensure it unmounts and hides the button when switching to `personal`._

**Step 2: Run linter and type check**

Run: `turbo run lint check-types --filter=web`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/features/Chat/UserPage.tsx
git commit -m "feat(ui): implement personal and groups tabs for user page"
```

---

### Task 4: Fix Main Button visibility logic

**Files:**

- Modify: `apps/web/src/components/features/Chat/UserPage.tsx`

**Step 1: Ensure Main Button is only visible on Groups tab**

Ensure that the `mainButton` is explicitly hidden when leaving the `GroupsTab`. The cleanup function in `GroupsTab`'s `useEffect` handles this nicely. We just need to ensure that the `Tabs` unmount correctly. By conditionally rendering the content `{selectedTab === "groups" && <GroupsTab />}` as done in Task 2, React will unmount `GroupsTab`, triggering the cleanup function to hide the button.

To be extra safe, we can add a check in `UserPage` to hide the main button if it's somehow left visible.

```tsx
// In UserPage.tsx
useEffect(() => {
  if (selectedTab !== "groups") {
    mainButton.setParams.ifAvailable({
      isVisible: false,
      isEnabled: false,
    });
  }
}, [selectedTab]);
```

**Step 2: Commit**

```bash
git add apps/web/src/components/features/Chat/UserPage.tsx
git commit -m "fix(ui): ensure main button is hidden on personal tab"
```

---
