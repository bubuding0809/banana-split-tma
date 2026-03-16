# Personal Expenses UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a personal expenses dashboard on the TMA home page (`/_tma/chat/`). We will align the look and feel precisely with the existing `GroupPage` component by using the same layout structure, Telegram UI components, and CSS utility classes. The dashboard will use `ChatTransactionTab` so users can view, edit, and delete their personal expenses just like in a group chat. We must preserve the existing entry-point routing logic in `apps/web/src/routes/_tma/home.tsx` and register the necessary search params for the transaction tab on `_tma/chat.index.tsx`.

**Architecture:** We will rewrite the existing `UserPage` to mimic the `GroupPage`'s layout pattern. We will include the `TabsList` component with "Personal" and "Groups" tabs (with "Groups" disabled for now). The profile header will use the standard `Cell` component with an `Avatar`. To ensure the transaction modal works, we will add the same Zod search schema used in `ChatIdRoute` to the `chat.index.tsx` route.

**Tech Stack:** React, `@tanstack/react-router`, `@telegram-apps/sdk-react`, `@telegram-apps/telegram-ui`, Tailwind CSS.

---

### Task 1: Update Route to Support Transaction Tab State

**Files:**

- Modify: `apps/web/src/routes/_tma/chat.index.tsx`

**Step 1: Add Search Schema for Transactions**

The `ChatTransactionTab` relies on search parameters (`selectedExpense`, `showPayments`, etc.) to handle sorting, filtering, and opening the expense details modal. We need to add the same Zod validation schema that `_tma/chat.$chatId.tsx` uses to the `_tma/chat.index.tsx` route.

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { UserPage } from "@/components/features";

const searchSchema = z.object({
  selectedExpense: z.string().optional(),
  showPayments: z.boolean().catch(true),
  relatedOnly: z.boolean().catch(true),
  sortBy: z.enum(["date", "createdAt"]).catch("date"),
  sortOrder: z.enum(["asc", "desc"]).catch("desc"),
});

export const Route = createFileRoute("/_tma/chat/")({
  validateSearch: zodValidator(searchSchema),
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
git commit -m "feat(ui): add search schema to chat index route for transaction tab support"
```

---

### Task 2: Refactor UserPage to mirror GroupPage layout

**Files:**

- Modify: `apps/web/src/components/features/Chat/UserPage.tsx`

**Step 1: Replace UserPage content with aligned UI**

Rewrite the component to use the standard `GroupPage` layout pattern, including the header `Cell`, `Divider`, `TabsList`, and the scrollable content area housing `ChatTransactionTab`.

```tsx
import { Users, Wallet } from "lucide-react";
import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import {
  Avatar,
  Cell,
  Divider,
  TabsList,
  Text,
} from "@telegram-apps/telegram-ui";
import { useRef } from "react";
import ChatTransactionTab from "./ChatTransactionTab";

const UserPage = () => {
  const tUserData = useSignal(initData.user);
  const tabListRef = useRef<HTMLDivElement>(null);
  const headerRefReal = useRef<HTMLElement>(null);

  const userId = tUserData?.id ?? 0;

  return (
    <main className="no-scrollbar flex flex-col">
      {/* Group settings cells pattern (from GroupPage) */}
      <div className="py-1">
        <Cell
          before={
            <Avatar size={48} src={tUserData?.photoUrl}>
              👤
            </Avatar>
          }
          subtitle="Personal Space"
        >
          {tUserData?.firstName} {tUserData?.lastName}
        </Cell>
      </div>

      <Divider />

      <section
        className="flex h-screen flex-col bg-neutral-50 pt-1 dark:bg-neutral-900/20"
        style={{
          height: `calc(100vh - ${headerRefReal.current?.clientHeight ?? 0}px)`,
        }}
      >
        {/* Tab list */}
        <div className="px-4" ref={tabListRef}>
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

        {/* Content Area */}
        <div
          className="relative flex-1 overflow-y-auto"
          style={{
            height: `calc(100vh - ${headerRefReal.current?.offsetHeight ?? 0}px - ${tabListRef.current?.offsetHeight ?? 0}px)`,
          }}
        >
          <ChatTransactionTab chatId={userId} />
        </div>
      </section>
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
git commit -m "feat(ui): implement personal expenses dashboard aligned with GroupPage layout"
```

---

### Task 1: Refactor UserPage to mirror GroupPage layout

**Files:**

- Modify: `apps/web/src/components/features/Chat/UserPage.tsx`

**Step 1: Replace UserPage content with aligned UI**

Rewrite the component to use the standard `GroupPage` layout pattern, including the header `Cell`, `Divider`, `TabsList`, and the scrollable content area.

```tsx
import { Users, Wallet } from "lucide-react";
import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import {
  Avatar,
  Cell,
  Divider,
  TabsList,
  Text,
} from "@telegram-apps/telegram-ui";
import { useRef } from "react";
import ChatTransactionTab from "./ChatTransactionTab";

const UserPage = () => {
  const tUserData = useSignal(initData.user);
  const tabListRef = useRef<HTMLDivElement>(null);
  const headerRefReal = useRef<HTMLElement>(null);

  const userId = tUserData?.id ?? 0;

  return (
    <main className="no-scrollbar flex flex-col">
      {/* Group settings cells pattern (from GroupPage) */}
      <div className="py-1">
        <Cell
          before={
            <Avatar size={48} src={tUserData?.photoUrl}>
              👤
            </Avatar>
          }
          subtitle="Personal Space"
        >
          {tUserData?.firstName} {tUserData?.lastName}
        </Cell>
      </div>

      <Divider />

      <section
        className="flex h-screen flex-col bg-neutral-50 pt-1 dark:bg-neutral-900/20"
        style={{
          height: `calc(100vh - ${headerRefReal.current?.clientHeight ?? 0}px)`,
        }}
      >
        {/* Tab list */}
        <div className="px-4" ref={tabListRef}>
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

        {/* Content Area */}
        <div
          className="relative flex-1 overflow-y-auto"
          style={{
            height: `calc(100vh - ${headerRefReal.current?.offsetHeight ?? 0}px - ${tabListRef.current?.offsetHeight ?? 0}px)`,
          }}
        >
          <ChatTransactionTab chatId={userId} />
        </div>
      </section>
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
git commit -m "feat(ui): implement personal expenses dashboard aligned with GroupPage layout"
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
