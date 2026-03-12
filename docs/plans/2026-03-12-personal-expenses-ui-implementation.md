# Personal Expenses UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a personal expenses dashboard on the TMA home page (private chat). We will use a tabbed layout, where the "Personal" tab acts as the primary dashboard, and the "Groups" tab is visible but disabled for now to indicate it is "coming soon". The previous "Add to group" logic will be removed.

**Architecture:** We will completely rewrite the existing `UserPage` to incorporate the `TabsList` component from `@telegram-apps/telegram-ui`. Since the "Groups" tab is disabled, we do not need URL search parameters (`selectedTab`) for navigation yet; we just hardcode the "Personal" tab as selected and render the dashboard content (profile header and `ChatTransactionTab`). The snapshots and add expense buttons are excluded as users interact via the bot chat interface.

**Tech Stack:** React, `@tanstack/react-router`, `@telegram-apps/sdk-react`, `@telegram-apps/telegram-ui`, Tailwind CSS.

---

### Task 1: Refactor UserPage to a Tabbed Dashboard

**Files:**

- Modify: `apps/web/src/components/features/Chat/UserPage.tsx`

**Step 1: Replace UserPage content with Dashboard UI**

Rewrite the component to use the Telegram UI TabsList, remove all main button logic, and add the personal transactions tab underneath.

```tsx
import { Users, Wallet } from "lucide-react";
import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import {
  Avatar,
  Caption,
  Divider,
  TabsList,
  Text,
} from "@telegram-apps/telegram-ui";
import ChatTransactionTab from "./ChatTransactionTab";

const UserPage = () => {
  const tUserData = useSignal(initData.user);

  const userId = tUserData?.id ?? 0;

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
          <TabsList.Item selected={true}>
            <div className="flex items-center justify-center gap-1">
              <Wallet size={16} />
              <Text weight="2">Personal</Text>
            </div>
          </TabsList.Item>
          {/* Disabled Groups Tab */}
          <TabsList.Item
            selected={false}
            onClick={() => {
              // Provide subtle feedback that it's disabled but interacted with
              hapticFeedback.notificationOccurred("warning");
            }}
            className="opacity-50"
          >
            <div className="flex items-center justify-center gap-1">
              <Users size={16} />
              <Text weight="3">Groups (Soon)</Text>
            </div>
          </TabsList.Item>
        </TabsList>
      </div>

      <Divider />

      {/* Personal Tab Content */}
      <div className="relative flex flex-1 flex-col overflow-y-auto bg-white pb-20 dark:bg-black">
        {/* Transactions List */}
        <div className="mt-2 flex-1">
          <ChatTransactionTab chatId={userId} />
        </div>
      </div>
    </main>
  );
};

export default UserPage;
```

**Step 2: Run linter and type checker**

Run: `turbo run lint check-types --filter=web`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/features/Chat/UserPage.tsx
git commit -m "feat(ui): implement personal expenses dashboard with tab layout in UserPage"
```

---

### Task 2: Clean up Chat Index Route

**Files:**

- Modify: `apps/web/src/routes/_tma/chat.index.tsx`

**Step 1: Revert route changes if any exist**

Ensure that `apps/web/src/routes/_tma/chat.index.tsx` does NOT have any search parameters (like `selectedTab`), as we are not navigating between tabs yet. It should just render the `UserPage` component.

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { UserPage } from "@/components/features";

export const Route = createFileRoute("/_tma/chat/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <UserPage />;
}
```

_(If this file already matches the above, this task is complete)._

**Step 2: Commit**

```bash
git add apps/web/src/routes/_tma/chat.index.tsx
git commit -m "refactor(ui): clean up chat index route"
```

---

### Task 1: Refactor UserPage to a Tabbed Dashboard

**Files:**

- Modify: `apps/web/src/components/features/Chat/UserPage.tsx`

**Step 1: Replace UserPage content with Dashboard UI**

Rewrite the component to use the Telegram UI TabsList, remove all main button logic, and add the personal dashboard content underneath.

```tsx
import { Link } from "@tanstack/react-router";
import { Aperture, Plus, Users, Wallet } from "lucide-react";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Button,
  Caption,
  Cell,
  Divider,
  Navigation,
  TabsList,
  Text,
} from "@telegram-apps/telegram-ui";
import ChatTransactionTab from "./ChatTransactionTab";

const UserPage = () => {
  const tUserData = useSignal(initData.user);
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const userId = tUserData?.id ?? 0;

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
          <TabsList.Item selected={true}>
            <div className="flex items-center justify-center gap-1">
              <Wallet size={16} />
              <Text weight="2">Personal</Text>
            </div>
          </TabsList.Item>
          {/* Disabled Groups Tab */}
          <TabsList.Item
            selected={false}
            onClick={() => {
              // Provide subtle feedback that it's disabled but interacted with
              hapticFeedback.notificationOccurred("warning");
            }}
            className="opacity-50"
          >
            <div className="flex items-center justify-center gap-1">
              <Users size={16} />
              <Text weight="3">Groups (Soon)</Text>
            </div>
          </TabsList.Item>
        </TabsList>
      </div>

      <Divider />

      {/* Personal Tab Content */}
      <div className="relative flex flex-1 flex-col overflow-y-auto bg-white pb-20 dark:bg-black">
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
          search={{ title: "+ Add expense" }}
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
        <div className="mt-2 flex-1">
          <ChatTransactionTab chatId={userId} />
        </div>
      </div>
    </main>
  );
};

export default UserPage;
```

**Step 2: Run linter and type checker**

Run: `turbo run lint check-types --filter=web`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/features/Chat/UserPage.tsx
git commit -m "feat(ui): implement personal expenses dashboard with tab layout in UserPage"
```

---

### Task 2: Clean up Chat Index Route

**Files:**

- Modify: `apps/web/src/routes/_tma/chat.index.tsx`

**Step 1: Revert route changes if any exist**

Ensure that `apps/web/src/routes/_tma/chat.index.tsx` does NOT have any search parameters (like `selectedTab`), as we are not navigating between tabs yet. It should just render the `UserPage` component.

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { UserPage } from "@/components/features";

export const Route = createFileRoute("/_tma/chat/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <UserPage />;
}
```

_(If this file already matches the above, this task is complete)._

**Step 2: Commit**

```bash
git add apps/web/src/routes/_tma/chat.index.tsx
git commit -m "refactor(ui): clean up chat index route"
```

---

### Task 1: Refactor UserPage to a Personal Expenses Dashboard

**Files:**

- Modify: `apps/web/src/components/features/Chat/UserPage.tsx`

**Step 1: Replace UserPage content with Dashboard UI**

Rewrite the component to remove all main button logic and placeholders, replacing them with the user's profile header, the "Add expense" button, the "Snapshots" link, and the `ChatTransactionTab`.

```tsx
import { Link } from "@tanstack/react-router";
import { Aperture, Plus } from "lucide-react";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Button,
  Caption,
  Cell,
  Divider,
  Navigation,
  Text,
} from "@telegram-apps/telegram-ui";
import ChatTransactionTab from "./ChatTransactionTab";

const UserPage = () => {
  const tUserData = useSignal(initData.user);
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const userId = tUserData?.id ?? 0;

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

      <div className="relative flex flex-1 flex-col overflow-y-auto bg-white pb-20 dark:bg-black">
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
          search={{ title: "+ Add expense" }}
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
        <div className="mt-2 flex-1">
          <ChatTransactionTab chatId={userId} />
        </div>
      </div>
    </main>
  );
};

export default UserPage;
```

**Step 2: Run linter and type checker**

Run: `turbo run lint check-types --filter=web`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/features/Chat/UserPage.tsx
git commit -m "feat(ui): implement personal expenses dashboard in UserPage"
```

---

### Task 2: Clean up Chat Index Route

**Files:**

- Modify: `apps/web/src/routes/_tma/chat.index.tsx`

**Step 1: Revert route changes if any exist**

Ensure that `apps/web/src/routes/_tma/chat.index.tsx` does NOT have any search parameters (like `selectedTab`), as we are no longer using tabs. It should just render the `UserPage` component.

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { UserPage } from "@/components/features";

export const Route = createFileRoute("/_tma/chat/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <UserPage />;
}
```

_(If this file already matches the above, this task is complete)._

**Step 2: Commit**

```bash
git add apps/web/src/routes/_tma/chat.index.tsx
git commit -m "refactor(ui): clean up chat index route"
```

---
