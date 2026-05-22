# People Command — Settle & Nudge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a cross-group **People** command to the BananaSplitz Raycast extension that lists everyone the user has a balance with, and lets them settle balances and nudge debtors — parity with the Telegram mini app's People tab.

**Architecture:** A new `people` Raycast `view` command loads `expenseShare.getMyCounterpartyBalances` + `user.getMe` via one `usePromise`, renders a two-section `List` (Owed to You / You Owe) with an inline detail pane, and exposes Settle All / Nudge / Settle by Group actions backed by `settleAllWithUser`, `nudgeCounterparty`, and `settleAllDebts`.

**Tech Stack:** Raycast API (`List`, `Action`, `confirmAlert`, `showToast`), `@raycast/utils` `usePromise`, tRPC client (`@dko/trpc`), React 19, TypeScript.

---

## Conventions & Context

- All work is in `apps/bananasplitz/`. Run commands from that directory unless noted.
- The extension has **no unit-test harness**. "Verify" steps use `pnpm check-types`
  (runs `tsc --noEmit`), `pnpm lint` (`ray lint`), and manual testing against the
  local lambda. Do not add a test framework — out of scope.
- The dev server (`ray develop`) hot-reloads; the design was approved against the
  local lambda + prod-snapshot DB.
- tRPC client: `getTrpcClient()` from `src/lib/trpc.ts`. All procedures are typed
  via the `AppRouter` import — a wrong procedure name fails `tsc`.
- Mirror existing patterns in `src/groups.tsx` and `src/group-transactions.tsx`:
  `usePromise` + `revalidate`, `isShowingDetail`, colored `tag` accessories,
  animated→success/failure toasts, `confirmAlert` for destructive/outward actions.
- Net sign convention everywhere: **positive = the counterparty owes you**,
  negative = you owe them. Color: green = owed to you, red = you owe. No `+`/`-`.
- Reference for the API shapes: `docs/plans/2026-05-21-people-command-design.md`.

**Backend procedures used (verified in `packages/trpc`):**
- `expenseShare.getMyCounterpartyBalances` — query, input `{ baseCurrency?: string }`.
- `expenseShare.settleAllWithUser` — mutation, input `{ counterpartyUserId: number }`,
  output `{ settled, baseCurrency, totalBaseAbs }`.
- `expenseShare.nudgeCounterparty` — mutation, input `{ counterpartyUserId: number }`,
  output `{ ok: true, nudgeCooldownUntil: number }`. Throws `TOO_MANY_REQUESTS` /
  `BAD_REQUEST`.
- `settlement.settleAllDebts` — mutation, input
  `{ chatId, senderId, receiverId, balances: {currency,amount}[], sendNotification? }`.

**Deployment caveat:** the extension hits the prod API by default. Before manual
testing confirm these procedures are live on prod, or point the `apiUrl`
preference at the local lambda (`http://localhost:8081/api/trpc`).

---

## Task 1: `formatRelativeShort` date helper

**Files:**
- Modify: `apps/bananasplitz/src/lib/format.ts` (append a new export)

**Step 1: Add the helper**

Append to `src/lib/format.ts`:

```ts
/**
 * A coarse "time from now" label for short countdowns, e.g. "~3h", "~45m",
 * "~2d". Input is a duration in milliseconds; non-positive input returns "now".
 */
export function formatRelativeShort(ms: number): string {
  if (ms <= 0) return "now";
  const minutes = ms / 60_000;
  if (minutes < 1) return "~1m";
  if (minutes < 60) return `~${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `~${Math.round(hours)}h`;
  return `~${Math.round(hours / 24)}d`;
}
```

**Step 2: Verify type-check passes**

Run: `cd apps/bananasplitz && pnpm check-types`
Expected: no errors.

**Step 3: Sanity-check the logic**

Run: `node -e "const m=60000; const f=(ms)=>{if(ms<=0)return'now';const mn=ms/m;if(mn<1)return'~1m';if(mn<60)return'~'+Math.round(mn)+'m';const h=mn/60;if(h<24)return'~'+Math.round(h)+'h';return'~'+Math.round(h/24)+'d'}; console.log(f(-5),f(30000),f(45*m),f(3*60*m),f(50*60*m))"`
Expected: `now ~1m ~45m ~3h ~2d`

**Step 4: Commit**

```bash
git add apps/bananasplitz/src/lib/format.ts
git commit -m "feat(bananasplitz): add formatRelativeShort duration helper"
```

---

## Task 2: Counterparty balance types + `bucketGroupsByChat`

**Files:**
- Create: `apps/bananasplitz/src/lib/balances.ts`

**Step 1: Create the file**

```ts
/** Shared cross-group balance types — the People command's data model. */

/** One (chat, currency) balance line with a counterparty. */
export type CounterpartyGroup = {
  chatId: number;
  chatTitle: string;
  currency: string;
  /** >0 = the counterparty owes you in this chat+currency, <0 = you owe them. */
  nativeNet: number;
  /** nativeNet converted to the caller's base currency. */
  baseNet: number;
};

/** A person the caller has an outstanding balance with, across all chats. */
export type Counterparty = {
  userId: number;
  firstName: string;
  lastName: string | null;
  hasStartedBot: boolean;
  /** Epoch ms when the next nudge is allowed, or null if not rate-limited. */
  nudgeCooldownUntil: number | null;
  /** >0 = they owe you overall, <0 = you owe them. In base currency. */
  totalBaseNet: number;
  groups: CounterpartyGroup[];
};

/** Full display name, trimmed. */
export function counterpartyName(cp: Pick<Counterparty, "firstName" | "lastName">): string {
  return [cp.firstName, cp.lastName].filter(Boolean).join(" ") || "Unknown";
}

/** A counterparty's balances within a single chat (may span currencies). */
export type ChatBucket = {
  chatId: number;
  chatTitle: string;
  currencies: CounterpartyGroup[];
};

/**
 * Bucket a counterparty's flat group list by chat. A chat can appear once per
 * currency in the source list; this collapses those into one entry per chat,
 * preserving the source order of first appearance.
 */
export function bucketGroupsByChat(groups: CounterpartyGroup[]): ChatBucket[] {
  const buckets = new Map<number, ChatBucket>();
  for (const g of groups) {
    const existing = buckets.get(g.chatId);
    if (existing) {
      existing.currencies.push(g);
    } else {
      buckets.set(g.chatId, {
        chatId: g.chatId,
        chatTitle: g.chatTitle,
        currencies: [g],
      });
    }
  }
  return [...buckets.values()];
}
```

**Step 2: Verify type-check passes**

Run: `cd apps/bananasplitz && pnpm check-types`
Expected: no errors (file is unused so far — that's fine).

**Step 3: Commit**

```bash
git add apps/bananasplitz/src/lib/balances.ts
git commit -m "feat(bananasplitz): add cross-group balance types and chat bucketing"
```

---

## Task 3: Register the `people` command

**Files:**
- Modify: `apps/bananasplitz/package.json` (the `commands` array)

**Step 1: Add the command entry**

In `package.json`, change the `commands` array from one entry to two:

```json
  "commands": [
    {
      "name": "groups",
      "title": "Groups",
      "subtitle": "Manage Banana Groups",
      "description": "Manage expenses across different groups",
      "mode": "view"
    },
    {
      "name": "people",
      "title": "People",
      "subtitle": "Banana Split Balances",
      "description": "Settle balances and nudge people across all your groups",
      "mode": "view"
    }
  ],
```

**Step 2: Verify**

Run: `cd apps/bananasplitz && pnpm lint`
Expected: `ray lint` validates `package.json`. It will warn that `src/people.tsx`
is missing (the command's entry point). That is expected until Task 4 — note it
and proceed. (If `ray lint` *errors* rather than warns, Task 4 resolves it.)

**Step 3: Commit**

```bash
git add apps/bananasplitz/package.json
git commit -m "feat(bananasplitz): register People command"
```

---

## Task 4: People command — list, sections, rows, net chip

**Files:**
- Create: `apps/bananasplitz/src/people.tsx`

This task builds the command end-to-end *except* the detail pane (Task 5),
mutation actions (Task 6), and the per-group view (Task 7). Rows get a
placeholder `ActionPanel` with just Refresh + Show/Hide Details so the file
type-checks and runs.

**Step 1: Create `src/people.tsx`**

```tsx
import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { getTrpcClient } from "./lib/trpc";
import { formatAmount } from "./lib/format";
import { type Counterparty, counterpartyName } from "./lib/balances";

/** Net chip: green when they owe you, red when you owe them. No +/- sign. */
function netAccessory(totalBaseNet: number, baseCurrency: string): List.Item.Accessory {
  return {
    tag: {
      value: `${formatAmount(totalBaseNet)} ${baseCurrency}`,
      color: totalBaseNet > 0 ? Color.Green : Color.Red,
    },
  };
}

function PersonRow(props: {
  person: Counterparty;
  baseCurrency: string;
  myUserId: number | null;
  showDetail: boolean;
  onToggleDetail: () => void;
  onRefresh: () => void;
}) {
  const { person, baseCurrency, showDetail, onToggleDetail, onRefresh } = props;
  return (
    <List.Item
      icon={{ source: Icon.Person, tintColor: person.totalBaseNet > 0 ? Color.Green : Color.Red }}
      title={counterpartyName(person)}
      accessories={[netAccessory(person.totalBaseNet, baseCurrency)]}
      actions={
        <ActionPanel>
          <Action
            title={showDetail ? "Hide Details" : "Show Details"}
            icon={Icon.Sidebar}
            onAction={onToggleDetail}
            shortcut={{ modifiers: ["cmd"], key: "d" }}
          />
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={onRefresh}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const [showDetail, setShowDetail] = useState(true);

  const { isLoading, data, revalidate } = usePromise(async () => {
    const trpc = getTrpcClient();
    // getMe may be unavailable — degrade gracefully; the backend defaults
    // baseCurrency itself when none is passed.
    const me = await trpc.user.getMe.query().catch(() => null);
    const result = await trpc.expenseShare.getMyCounterpartyBalances.query(
      me?.baseCurrency ? { baseCurrency: me.baseCurrency } : {},
    );
    return {
      baseCurrency: result.baseCurrency,
      counterparties: result.counterparties as Counterparty[],
      myUserId: me?.id ?? null,
    };
  });

  const baseCurrency = data?.baseCurrency ?? "SGD";
  const counterparties = data?.counterparties ?? [];
  const myUserId = data?.myUserId ?? null;

  // Sort each section by magnitude, largest balance first.
  const byMagnitude = (a: Counterparty, b: Counterparty) =>
    Math.abs(b.totalBaseNet) - Math.abs(a.totalBaseNet);
  const owedToYou = counterparties.filter((c) => c.totalBaseNet > 0).sort(byMagnitude);
  const youOwe = counterparties.filter((c) => c.totalBaseNet < 0).sort(byMagnitude);

  const toggleDetail = () => setShowDetail((v) => !v);

  const renderPerson = (person: Counterparty) => (
    <PersonRow
      key={person.userId}
      person={person}
      baseCurrency={baseCurrency}
      myUserId={myUserId}
      showDetail={showDetail}
      onToggleDetail={toggleDetail}
      onRefresh={revalidate}
    />
  );

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail && counterparties.length > 0}
      searchBarPlaceholder="Search people…"
    >
      <List.EmptyView
        icon={Icon.CheckCircle}
        title={isLoading ? "Loading balances…" : "You're all settled up"}
        description={
          isLoading
            ? undefined
            : "Nobody owes you and you owe nobody — or your API key is invalid (check extension preferences)."
        }
      />
      <List.Section title="Owed to You" subtitle={`${owedToYou.length}`}>
        {owedToYou.map(renderPerson)}
      </List.Section>
      <List.Section title="You Owe" subtitle={`${youOwe.length}`}>
        {youOwe.map(renderPerson)}
      </List.Section>
    </List>
  );
}
```

**Step 2: Verify type-check passes**

Run: `cd apps/bananasplitz && pnpm check-types`
Expected: no errors. `myUserId` is unused for now — it is referenced once it's
passed down; if `tsc` flags it as unused, prefix with `void myUserId;` is NOT
needed because it is read in JSX props. Confirm clean output.

**Step 3: Verify lint passes**

Run: `cd apps/bananasplitz && pnpm lint`
Expected: no errors (Task 3's missing-entry-point warning is now resolved).

**Step 4: Manual test**

With `ray develop` running, open the **People** command in Raycast. Expected:
two sections (Owed to You / You Owe) with people and colored net chips, or the
"all settled up" empty view. `⌘D` toggles the (still empty) detail pane.

**Step 5: Commit**

```bash
git add apps/bananasplitz/src/people.tsx
git commit -m "feat(bananasplitz): People command list with balance sections"
```

---

## Task 5: Person detail pane

**Files:**
- Modify: `apps/bananasplitz/src/people.tsx`

**Step 1: Add the `PersonDetailPane` component**

Add above `PersonRow` in `src/people.tsx`:

```tsx
import { formatRelativeShort } from "./lib/format";
```

(Merge into the existing `./lib/format` import line:
`import { formatAmount, formatRelativeShort } from "./lib/format";`)

```tsx
/** Inline detail pane — mirrors the group detail pane's metadata style. */
function PersonDetailPane(props: { person: Counterparty; baseCurrency: string }) {
  const { person, baseCurrency } = props;
  const Metadata = List.Item.Detail.Metadata;
  const owesYou = person.totalBaseNet > 0;

  // Nudge status line — nudge is creditor-only (they must owe you).
  let nudgeStatus: string | null = null;
  if (owesYou) {
    if (!person.hasStartedBot) {
      nudgeStatus = "Can't nudge — hasn't started the bot";
    } else if (person.nudgeCooldownUntil && person.nudgeCooldownUntil > Date.now()) {
      nudgeStatus = `Available in ${formatRelativeShort(person.nudgeCooldownUntil - Date.now())}`;
    } else {
      nudgeStatus = "Available";
    }
  }

  return (
    <List.Item.Detail
      metadata={
        <Metadata>
          <Metadata.TagList title="Net Balance">
            <Metadata.TagList.Item
              text={`${formatAmount(person.totalBaseNet)} ${baseCurrency}`}
              color={owesYou ? Color.Green : Color.Red}
            />
          </Metadata.TagList>
          <Metadata.Separator />
          {person.groups.map((g, i) => (
            <Metadata.Label
              key={`${g.chatId}-${g.currency}-${i}`}
              title={g.chatTitle}
              text={`${formatAmount(g.nativeNet)} ${g.currency}`}
            />
          ))}
          {nudgeStatus ? (
            <>
              <Metadata.Separator />
              <Metadata.Label title="Nudge" text={nudgeStatus} />
            </>
          ) : null}
        </Metadata>
      }
    />
  );
}
```

**Step 2: Wire the pane into `PersonRow`**

In `PersonRow`'s `<List.Item>`, add the `detail` prop (after `accessories`):

```tsx
      detail={<PersonDetailPane person={person} baseCurrency={baseCurrency} />}
```

**Step 3: Verify type-check + lint**

Run: `cd apps/bananasplitz && pnpm check-types && pnpm lint`
Expected: no errors.

**Step 4: Manual test**

Reload People in Raycast. Selecting a person shows the detail pane: a colored
"Net Balance" chip, one line per group with its native amount, and a "Nudge"
status line for people who owe you.

**Step 5: Commit**

```bash
git add apps/bananasplitz/src/people.tsx
git commit -m "feat(bananasplitz): People detail pane with per-group breakdown"
```

---

## Task 6: Settle All + Nudge actions

**Files:**
- Modify: `apps/bananasplitz/src/people.tsx`

**Step 1: Extend imports**

Update the `@raycast/api` import to add `Alert`, `confirmAlert`, `showToast`,
`Toast`:

```tsx
import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
```

**Step 2: Add settle + nudge handlers and actions to `PersonRow`**

Inside `PersonRow`, before the `return`, add:

```tsx
  const name = counterpartyName(person);
  const owesYou = person.totalBaseNet > 0;
  const onCooldown =
    person.nudgeCooldownUntil != null && person.nudgeCooldownUntil > Date.now();

  async function handleSettleAll() {
    const confirmed = await confirmAlert({
      title: `Settle all with ${name}?`,
      message: `Records settlements for your entire balance (${formatAmount(
        person.totalBaseNet,
      )} ${baseCurrency}) across every group. They'll be notified.`,
      icon: Icon.Check,
      primaryAction: { title: "Settle All", style: Alert.ActionStyle.Default },
    });
    if (!confirmed) return;

    const toast = await showToast({ style: Toast.Style.Animated, title: "Settling…" });
    try {
      const res = await getTrpcClient().expenseShare.settleAllWithUser.mutate({
        counterpartyUserId: person.userId,
      });
      toast.style = Toast.Style.Success;
      toast.title = `Settled ${res.settled} ${res.settled === 1 ? "balance" : "balances"}`;
      onRefresh();
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to settle";
      toast.message = err instanceof Error ? err.message : String(err);
    }
  }

  async function handleNudge() {
    if (!person.hasStartedBot) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Can't nudge",
        message: `${name} hasn't started the bot.`,
      });
      return;
    }
    if (onCooldown) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Already nudged",
        message: `Try again in ${formatRelativeShort(person.nudgeCooldownUntil! - Date.now())}.`,
      });
      return;
    }
    const toast = await showToast({ style: Toast.Style.Animated, title: "Nudging…" });
    try {
      await getTrpcClient().expenseShare.nudgeCounterparty.mutate({
        counterpartyUserId: person.userId,
      });
      toast.style = Toast.Style.Success;
      toast.title = `Nudged ${name}`;
      onRefresh();
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to nudge";
      toast.message = err instanceof Error ? err.message : String(err);
    }
  }
```

**Step 3: Add the actions to the `ActionPanel`**

Replace `PersonRow`'s `<ActionPanel>` contents so Settle All is first (the `⏎`
default), Nudge appears only when they owe you:

```tsx
        <ActionPanel>
          <Action
            title="Settle All"
            icon={Icon.Check}
            onAction={handleSettleAll}
          />
          {owesYou ? (
            <Action
              title="Nudge"
              icon={Icon.AlarmRinging}
              onAction={handleNudge}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
            />
          ) : null}
          <Action
            title={showDetail ? "Hide Details" : "Show Details"}
            icon={Icon.Sidebar}
            onAction={onToggleDetail}
            shortcut={{ modifiers: ["cmd"], key: "d" }}
          />
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={onRefresh}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
        </ActionPanel>
```

**Step 4: Verify type-check + lint**

Run: `cd apps/bananasplitz && pnpm check-types && pnpm lint`
Expected: no errors.

**Step 5: Manual test**

- On a person who owes you: `⌘N` nudges → success toast; nudge again → "Already
  nudged" toast; the detail pane's Nudge line shows the cooldown after reload.
- On a person you owe: no Nudge action present.
- `⏎` Settle All → confirm dialog → on confirm, the person drops off the list
  (balance zeroed) after the refresh.

**Step 6: Commit**

```bash
git add apps/bananasplitz/src/people.tsx
git commit -m "feat(bananasplitz): Settle All and Nudge actions in People"
```

---

## Task 7: `CounterpartyGroups` per-group settle view

**Files:**
- Create: `apps/bananasplitz/src/counterparty-groups.tsx`
- Modify: `apps/bananasplitz/src/people.tsx` (wire the push action)

**Step 1: Create `src/counterparty-groups.tsx`**

```tsx
import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { getTrpcClient } from "./lib/trpc";
import { formatAmount } from "./lib/format";
import {
  bucketGroupsByChat,
  type ChatBucket,
  type Counterparty,
  counterpartyName,
} from "./lib/balances";

/**
 * Per-chat settle view for one counterparty. Each row is a chat; settling a
 * row records settlements for every currency in that chat.
 */
export function CounterpartyGroups(props: {
  person: Counterparty;
  baseCurrency: string;
  myUserId: number | null;
  onSettled: () => void;
}) {
  const { person, myUserId, onSettled } = props;
  const buckets = bucketGroupsByChat(person.groups);
  const name = counterpartyName(person);

  return (
    <List navigationTitle={`Balances with ${name}`} isShowingDetail={false}>
      <List.EmptyView icon={Icon.CheckCircle} title="No group balances" />
      {buckets.map((bucket) => (
        <ChatRow
          key={bucket.chatId}
          bucket={bucket}
          person={person}
          myUserId={myUserId}
          onSettled={onSettled}
        />
      ))}
    </List>
  );
}

function ChatRow(props: {
  bucket: ChatBucket;
  person: Counterparty;
  myUserId: number | null;
  onSettled: () => void;
}) {
  const { bucket, person, myUserId, onSettled } = props;
  const name = counterpartyName(person);

  const accessories: List.Item.Accessory[] = bucket.currencies.map((c) => ({
    tag: {
      value: `${formatAmount(c.nativeNet)} ${c.currency}`,
      color: c.nativeNet > 0 ? Color.Green : Color.Red,
    },
  }));

  async function handleSettleGroup() {
    if (myUserId == null) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't identify you",
        message: "user.getMe failed — can't determine settlement direction.",
      });
      return;
    }
    const confirmed = await confirmAlert({
      title: `Settle ${bucket.chatTitle}?`,
      message: `Records settlements for your balance with ${name} in this group. They'll be notified.`,
      icon: Icon.Check,
      primaryAction: { title: "Settle", style: Alert.ActionStyle.Default },
    });
    if (!confirmed) return;

    // settleAllDebts takes one sender/receiver pair, so split the chat's
    // currencies by direction: where you're the debtor vs the creditor.
    // Positive nativeNet => counterparty owes you (you're the creditor).
    const youAreCreditor = bucket.currencies.filter((c) => c.nativeNet > 0);
    const youAreDebtor = bucket.currencies.filter((c) => c.nativeNet < 0);

    const calls: { senderId: number; receiverId: number; balances: { currency: string; amount: number }[] }[] = [];
    if (youAreCreditor.length > 0) {
      calls.push({
        senderId: person.userId,
        receiverId: myUserId,
        balances: youAreCreditor.map((c) => ({ currency: c.currency, amount: Math.abs(c.nativeNet) })),
      });
    }
    if (youAreDebtor.length > 0) {
      calls.push({
        senderId: myUserId,
        receiverId: person.userId,
        balances: youAreDebtor.map((c) => ({ currency: c.currency, amount: Math.abs(c.nativeNet) })),
      });
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: "Settling group…" });
    try {
      const trpc = getTrpcClient();
      for (const call of calls) {
        await trpc.settlement.settleAllDebts.mutate({
          chatId: bucket.chatId,
          senderId: call.senderId,
          receiverId: call.receiverId,
          balances: call.balances,
          sendNotification: true,
        });
      }
      toast.style = Toast.Style.Success;
      toast.title = `Settled ${bucket.chatTitle}`;
      onSettled();
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to settle group";
      toast.message = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <List.Item
      icon={Icon.TwoPeople}
      title={bucket.chatTitle}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action title="Settle This Group" icon={Icon.Check} onAction={handleSettleGroup} />
        </ActionPanel>
      }
    />
  );
}
```

**Step 2: Wire the push action into `PersonRow`**

In `src/people.tsx`, add the import:

```tsx
import { CounterpartyGroups } from "./counterparty-groups";
```

Add this `Action.Push` to `PersonRow`'s `ActionPanel`, after Nudge and before
Show/Hide Details:

```tsx
          <Action.Push
            title="Settle by Group"
            icon={Icon.List}
            shortcut={{ modifiers: ["cmd"], key: "arrowRight" }}
            target={
              <CounterpartyGroups
                person={person}
                baseCurrency={baseCurrency}
                myUserId={myUserId}
                onSettled={onRefresh}
              />
            }
          />
```

**Step 3: Verify type-check + lint**

Run: `cd apps/bananasplitz && pnpm check-types && pnpm lint`
Expected: no errors.

**Step 4: Manual test**

- From a person row, `⌘→` (Settle by Group) pushes a list of that person's
  chats, each with native-currency chips.
- "Settle This Group" → confirm → settles only that chat; on pop, the People
  list has refreshed and that chat's portion of the balance is gone.
- Verify direction: a chat where you owe vs. one where you're owed both settle
  correctly (no "cannot settle with yourself" / wrong-direction errors).

**Step 5: Commit**

```bash
git add apps/bananasplitz/src/counterparty-groups.tsx apps/bananasplitz/src/people.tsx
git commit -m "feat(bananasplitz): per-group settle view for a counterparty"
```

---

## Task 8: Final verification pass

**Files:** none (verification only)

**Step 1: Full type-check and lint**

Run: `cd apps/bananasplitz && pnpm check-types && pnpm lint`
Expected: both pass with no errors.

**Step 2: Production build**

Run: `cd apps/bananasplitz && pnpm build`
Expected: `ray build` completes successfully.

**Step 3: End-to-end manual test (against local lambda or verified prod)**

Walk the full flow once:
1. Open People — two sections, sorted by magnitude, correct chip colors.
2. Detail pane — net chip, per-group lines, nudge status correct per person.
3. Nudge a debtor — succeeds; repeat is blocked with the cooldown toast.
4. Settle by Group — settles one chat; People refreshes.
5. Settle All — clears a person entirely; they leave the list.
6. Empty state shows when fully settled.

**Step 4: Confirm no stray files / secrets**

Run: `git status`
Expected: clean tree; no `.env`, no Vercel secrets staged.

**Step 5: Final commit (if anything outstanding)**

Only if Steps 1-4 surfaced fixes — otherwise the feature is already committed
task-by-task.

---

## Done

The People command is complete: cross-group balances, Settle All, per-group
settle, and Nudge with cooldown surfacing — parity with the mini app's People
tab. Backend changes are not required (all procedures already exist); confirm
they are deployed to prod before relying on the extension's default API URL.
