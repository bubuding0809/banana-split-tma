import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { getTrpcClient } from "./lib/trpc";
import { formatAmount, formatShortDate } from "./lib/format";
import type { Category } from "./lib/transactions";
import { GroupTransactions } from "./group-transactions";
import { AddExpenseForm } from "./add-expense";

/** A chat the caller has an outstanding balance in (from getMyBalancesAcrossChats). */
type BalanceEntry = {
  chatId: number;
  chatTitle: string;
  debtSimplificationEnabled: boolean;
  currencies: { currency: string; net: number }[];
  counterparties: { userId: number; name: string; currency: string; net: number }[];
};

type Group = {
  id: number;
  title: string;
  type: string;
  baseCurrency: string;
  debtSimplificationEnabled: boolean;
  createdAt: Date;
};

/** Expense row from getAllExpensesByChat (its output schema is z.any()). */
type FullExpense = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  date: Date;
  categoryId: string | null;
  shares: { userId: number; amount: number }[];
};

const PERSONAL_TYPES = new Set(["private", "sender"]);

/** One colored tag per currency: green when you're owed, red when you owe. */
function balanceAccessories(balance: BalanceEntry): List.Item.Accessory[] {
  return balance.currencies.map((c) => ({
    tag: {
      value: `${formatAmount(c.net)} ${c.currency}`,
      color: c.net > 0 ? Color.Green : Color.Red,
    },
  }));
}

function balanceSummary(balance: BalanceEntry): string {
  return balance.currencies
    .map((c) => `${c.net > 0 ? "Owed to you" : "You owe"}: ${formatAmount(c.net)} ${c.currency}`)
    .join("\n");
}

/** Split-panel detail: group facts, the caller's balance breakdown, recent expenses. */
function GroupDetail(props: {
  group: Group;
  lastActive: Date;
  recentExpenses: FullExpense[];
  categories: Map<string, Category>;
  myUserId: number | null;
  balance?: BalanceEntry;
}) {
  const { group, lastActive, recentExpenses, categories, myUserId, balance } = props;
  const Metadata = List.Item.Detail.Metadata;

  // Split counterparties into two sections, each sorted biggest-first.
  const counterparties = balance ? balance.counterparties : [];
  const owedToYou = counterparties.filter((c) => c.net > 0).sort((a, b) => b.net - a.net);
  const youOwe = counterparties.filter((c) => c.net < 0).sort((a, b) => a.net - b.net);

  return (
    <List.Item.Detail
      metadata={
        <Metadata>
          <Metadata.Label title="Base Currency" text={group.baseCurrency} />
          <Metadata.Label title="Last Active" text={lastActive.toLocaleDateString()} />
          <Metadata.Label title="Debt Simplification" text={group.debtSimplificationEnabled ? "On" : "Off"} />
          <Metadata.Separator />

          {balance ? (
            <>
              <Metadata.TagList title="Your Net Balance">
                {balance.currencies.map((c) => (
                  <Metadata.TagList.Item
                    key={c.currency}
                    text={`${formatAmount(c.net)} ${c.currency}`}
                    color={c.net > 0 ? Color.Green : Color.Red}
                  />
                ))}
              </Metadata.TagList>
              {owedToYou.length > 0 ? (
                <Metadata.TagList title="Owed to You">
                  {owedToYou.map((cp, i) => (
                    <Metadata.TagList.Item
                      key={`${cp.userId}-${cp.currency}-${i}`}
                      text={`${cp.name} · ${formatAmount(cp.net)} ${cp.currency}`}
                      color={Color.Green}
                    />
                  ))}
                </Metadata.TagList>
              ) : null}
              {youOwe.length > 0 ? (
                <Metadata.TagList title="You Owe">
                  {youOwe.map((cp, i) => (
                    <Metadata.TagList.Item
                      key={`${cp.userId}-${cp.currency}-${i}`}
                      text={`${cp.name} · ${formatAmount(cp.net)} ${cp.currency}`}
                      color={Color.Red}
                    />
                  ))}
                </Metadata.TagList>
              ) : null}
            </>
          ) : (
            <Metadata.Label
              title="Status"
              text="All settled up"
              icon={{ source: Icon.CheckCircle, tintColor: Color.Green }}
            />
          )}

          <Metadata.Separator />
          {recentExpenses.length > 0 ? (
            <>
              {recentExpenses.map((e) => {
                const category = e.categoryId ? categories.get(e.categoryId) : undefined;
                const myShare = myUserId == null ? null : (e.shares.find((s) => s.userId === myUserId)?.amount ?? null);
                // Emoji leads the title — a metadata Label's `icon` renders on
                // the right next to `text`, so it can't sit first otherwise.
                const emoji = category?.emoji ?? "🧾";
                const text = `${formatAmount(myShare ?? e.amount)} ${e.currency} · ${formatShortDate(e.date)}`;
                return <Metadata.Label key={e.id} title={`${emoji}  ${e.description}`} text={text} />;
              })}
              <Metadata.Label title="↵ Enter group" text="See all transactions" />
            </>
          ) : (
            <Metadata.Label title="Recent Expenses" text="None yet" />
          )}
        </Metadata>
      }
    />
  );
}

function GroupActions(props: {
  group: Group;
  balance?: BalanceEntry;
  showDetail: boolean;
  onToggleDetail: () => void;
  onRefresh: () => void;
}) {
  const { group, balance, showDetail, onToggleDetail, onRefresh } = props;

  async function toggleDebtSimplification() {
    const enabling = !group.debtSimplificationEnabled;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Updating debt simplification…",
    });
    try {
      await getTrpcClient().chat.updateChat.mutate({
        chatId: group.id,
        debtSimplificationEnabled: enabling,
      });
      toast.style = Toast.Style.Success;
      toast.title = enabling ? "Debt simplification turned on" : "Debt simplification turned off";
      onRefresh();
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to update debt simplification";
      toast.message = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <ActionPanel>
      <Action.Push
        title="View Transactions"
        icon={Icon.List}
        target={<GroupTransactions chatId={group.id} title={group.title} baseCurrency={group.baseCurrency} />}
      />
      <Action.Push
        title="Add Expense"
        icon={Icon.Plus}
        shortcut={{ modifiers: ["cmd"], key: "n" }}
        target={
          <AddExpenseForm
            chatId={group.id}
            baseCurrency={group.baseCurrency}
            groupTitle={group.title}
            onCreated={onRefresh}
          />
        }
      />
      <Action
        title={showDetail ? "Hide Details" : "Show Details"}
        icon={Icon.Sidebar}
        onAction={onToggleDetail}
        shortcut={{ modifiers: ["cmd"], key: "d" }}
      />
      <Action
        title={group.debtSimplificationEnabled ? "Turn off Debt Simplification" : "Turn on Debt Simplification"}
        icon={Icon.Shuffle}
        onAction={toggleDebtSimplification}
        shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
      />
      <Action.CopyToClipboard title="Copy Group ID" content={String(group.id)} />
      {balance ? <Action.CopyToClipboard title="Copy Balance Summary" content={balanceSummary(balance)} /> : null}
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        onAction={onRefresh}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
      />
    </ActionPanel>
  );
}

export default function Command() {
  const [showDetail, setShowDetail] = useState(true);

  const { isLoading, data, revalidate } = usePromise(async () => {
    const trpc = getTrpcClient();
    const [groups, balanceResult, me] = await Promise.all([
      trpc.chat.getAllChats.query({}),
      trpc.expenseShare.getMyBalancesAcrossChats.query(),
      // getMe may be unavailable — degrade to "no share" rather than fail.
      trpc.user.getMe.query().catch(() => null),
    ]);

    const balanceByChatId = new Map<number, BalanceEntry>(balanceResult.balances.map((b) => [b.chatId, b]));

    // Per-chat expenses + categories. getAllExpensesByChat is ordered
    // date-desc and carries shares (for "your share") + categoryId. All
    // collapsed into one batched request by httpBatchLink.
    const perChat = await Promise.all(
      groups.map(async (g) => {
        const [expenses, categories] = await Promise.all([
          trpc.expense.getAllExpensesByChat.query({ chatId: g.id }).catch(() => []),
          trpc.category.listByChat.query({ chatId: g.id }).catch(() => ({ items: [] as Category[] })),
        ]);
        return {
          id: g.id,
          expenses: expenses as FullExpense[],
          categories: categories.items,
        };
      }),
    );

    const expensesByChatId = new Map<number, FullExpense[]>(perChat.map((p) => [p.id, p.expenses]));
    const categoryByChatId = new Map<number, Map<string, Category>>(
      perChat.map((p) => [
        p.id,
        new Map(p.categories.map((c) => [c.id, { id: c.id, emoji: c.emoji, title: c.title }])),
      ]),
    );

    return {
      groups,
      balanceByChatId,
      expensesByChatId,
      categoryByChatId,
      myUserId: me?.id ?? null,
    };
  });

  const { groups, balanceByChatId, expensesByChatId, categoryByChatId, myUserId } = data ?? {
    groups: [] as Group[],
    balanceByChatId: new Map<number, BalanceEntry>(),
    expensesByChatId: new Map<number, FullExpense[]>(),
    categoryByChatId: new Map<number, Map<string, Category>>(),
    myUserId: null as number | null,
  };

  const expensesOf = (group: Group): FullExpense[] => expensesByChatId.get(group.id) ?? [];

  const categoriesOf = (group: Group): Map<string, Category> => categoryByChatId.get(group.id) ?? new Map();

  // Last-active = most recent expense date, falling back to chat creation.
  const lastActiveOf = (group: Group): Date => expensesOf(group)[0]?.date ?? group.createdAt;

  const byLastActiveDesc = (a: Group, b: Group) => lastActiveOf(b).getTime() - lastActiveOf(a).getTime();

  // Personal (1-on-1) chats get their own section on top.
  const personal = groups.filter((g) => PERSONAL_TYPES.has(g.type)).sort(byLastActiveDesc);
  const shared = groups.filter((g) => !PERSONAL_TYPES.has(g.type));
  const active = shared.filter((g) => balanceByChatId.has(g.id)).sort(byLastActiveDesc);
  const settled = shared.filter((g) => !balanceByChatId.has(g.id)).sort(byLastActiveDesc);

  const toggleDetail = () => setShowDetail((v) => !v);

  const renderGroup = (group: Group, variant: "personal" | "active" | "settled") => {
    const balance = balanceByChatId.get(group.id);
    const icon =
      variant === "personal"
        ? { source: Icon.Person, tintColor: Color.Blue }
        : variant === "settled"
          ? { source: Icon.TwoPeople, tintColor: Color.SecondaryText }
          : Icon.TwoPeople;
    return (
      <List.Item
        key={group.id}
        icon={icon}
        title={group.title}
        accessories={balance ? balanceAccessories(balance) : showDetail ? undefined : [{ text: group.baseCurrency }]}
        detail={
          <GroupDetail
            group={group}
            lastActive={lastActiveOf(group)}
            recentExpenses={expensesOf(group).slice(0, 12)}
            categories={categoriesOf(group)}
            myUserId={myUserId}
            balance={balance}
          />
        }
        actions={
          <GroupActions
            group={group}
            balance={balance}
            showDetail={showDetail}
            onToggleDetail={toggleDetail}
            onRefresh={revalidate}
          />
        }
      />
    );
  };

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail && groups.length > 0}
      searchBarPlaceholder="Search your banana groups…"
    >
      <List.EmptyView
        icon={Icon.Bird}
        title={isLoading ? "Loading groups…" : "No groups found"}
        description={
          isLoading
            ? undefined
            : "You're not a member of any groups yet, or your API key is invalid. Check the extension preferences."
        }
      />

      <List.Section title="Personal" subtitle={`${personal.length}`}>
        {personal.map((group) => renderGroup(group, "personal"))}
      </List.Section>

      <List.Section title="Active" subtitle={`${active.length}`}>
        {active.map((group) => renderGroup(group, "active"))}
      </List.Section>

      <List.Section title="Settled" subtitle={`${settled.length}`}>
        {settled.map((group) => renderGroup(group, "settled"))}
      </List.Section>
    </List>
  );
}
