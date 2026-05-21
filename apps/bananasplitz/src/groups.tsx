import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { getTrpcClient } from "./lib/trpc";
import { CHAT_TYPE_LABEL, formatAmount, formatNet } from "./lib/format";
import type { Category } from "./lib/transactions";
import { GroupTransactions } from "./group-transactions";

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
  createdAt: Date;
};

/** Lean expense row from listByChatLean (its output schema is z.any()). */
type LeanExpense = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  date: Date;
  categoryId: string | null;
};

/** One colored tag per currency: green when you're owed, red when you owe. */
function balanceAccessories(balance: BalanceEntry): List.Item.Accessory[] {
  return balance.currencies.map((c) => ({
    tag: {
      value: formatNet(c.net, c.currency),
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
  recentExpenses: LeanExpense[];
  categories: Map<string, Category>;
  balance?: BalanceEntry;
}) {
  const { group, lastActive, recentExpenses, categories, balance } = props;
  const Metadata = List.Item.Detail.Metadata;

  // They-owe-you first, then you-owe-them.
  const counterparties = balance ? [...balance.counterparties].sort((a, b) => b.net - a.net) : [];

  return (
    <List.Item.Detail
      metadata={
        <Metadata>
          <Metadata.Label title="Type" text={CHAT_TYPE_LABEL[group.type] ?? group.type} />
          <Metadata.Label title="Base Currency" text={group.baseCurrency} />
          <Metadata.Label title="Last Active" text={lastActive.toLocaleDateString()} />
          {balance ? (
            <Metadata.Label title="Debt Simplification" text={balance.debtSimplificationEnabled ? "On" : "Off"} />
          ) : null}
          <Metadata.Separator />

          {balance ? (
            <>
              <Metadata.TagList title="Your Net Balance">
                {balance.currencies.map((c) => (
                  <Metadata.TagList.Item
                    key={c.currency}
                    text={formatNet(c.net, c.currency)}
                    color={c.net > 0 ? Color.Green : Color.Red}
                  />
                ))}
              </Metadata.TagList>
              {counterparties.map((cp, i) => (
                <Metadata.Label
                  key={`${cp.userId}-${cp.currency}-${i}`}
                  title={cp.name}
                  icon={
                    cp.net > 0
                      ? { source: Icon.ArrowDown, tintColor: Color.Green }
                      : { source: Icon.ArrowUp, tintColor: Color.Red }
                  }
                  text={{
                    value: `${cp.net > 0 ? "owes you" : "you owe"} ${formatAmount(cp.net)} ${cp.currency}`,
                    color: cp.net > 0 ? Color.Green : Color.Red,
                  }}
                />
              ))}
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
            recentExpenses.map((e) => {
              const category = e.categoryId ? categories.get(e.categoryId) : undefined;
              return (
                <Metadata.Label
                  key={e.id}
                  title={e.description}
                  icon={category ? category.emoji : { source: Icon.Receipt, tintColor: Color.Orange }}
                  text={`${formatAmount(e.amount)} ${e.currency}`}
                />
              );
            })
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
  return (
    <ActionPanel>
      <Action.Push
        title="View Transactions"
        icon={Icon.List}
        target={<GroupTransactions chatId={group.id} title={group.title} />}
      />
      <Action
        title={showDetail ? "Hide Details" : "Show Details"}
        icon={Icon.Sidebar}
        onAction={onToggleDetail}
        shortcut={{ modifiers: ["cmd"], key: "d" }}
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
    const [groups, balanceResult] = await Promise.all([
      trpc.chat.getAllChats.query({}),
      trpc.expenseShare.getMyBalancesAcrossChats.query(),
    ]);

    const balanceByChatId = new Map<number, BalanceEntry>(balanceResult.balances.map((b) => [b.chatId, b]));

    // Per-chat lean expenses + categories. listByChatLean drives the
    // last-active sort and the recent-expenses preview; listByChat resolves
    // each expense's category emoji. All collapsed into one batched request.
    const perChat = await Promise.all(
      groups.map(async (g) => {
        const [expenses, categories] = await Promise.all([
          trpc.expense.listByChatLean.query({ chatId: g.id }).catch(() => []),
          trpc.category.listByChat.query({ chatId: g.id }).catch(() => ({ items: [] as Category[] })),
        ]);
        return {
          id: g.id,
          expenses: expenses as LeanExpense[],
          categories: categories.items,
        };
      }),
    );

    const expensesByChatId = new Map<number, LeanExpense[]>(perChat.map((p) => [p.id, p.expenses]));
    const categoryByChatId = new Map<number, Map<string, Category>>(
      perChat.map((p) => [
        p.id,
        new Map(p.categories.map((c) => [c.id, { id: c.id, emoji: c.emoji, title: c.title }])),
      ]),
    );

    return { groups, balanceByChatId, expensesByChatId, categoryByChatId };
  });

  const { groups, balanceByChatId, expensesByChatId, categoryByChatId } = data ?? {
    groups: [] as Group[],
    balanceByChatId: new Map<number, BalanceEntry>(),
    expensesByChatId: new Map<number, LeanExpense[]>(),
    categoryByChatId: new Map<number, Map<string, Category>>(),
  };

  const expensesOf = (group: Group): LeanExpense[] => expensesByChatId.get(group.id) ?? [];

  const categoriesOf = (group: Group): Map<string, Category> => categoryByChatId.get(group.id) ?? new Map();

  // Last-active = most recent expense date, falling back to chat creation.
  const lastActiveOf = (group: Group): Date => expensesOf(group)[0]?.date ?? group.createdAt;

  // Most recently active first, in both sections.
  const byLastActiveDesc = (a: Group, b: Group) => lastActiveOf(b).getTime() - lastActiveOf(a).getTime();

  const active = groups.filter((g) => balanceByChatId.has(g.id)).sort(byLastActiveDesc);

  const settled = groups.filter((g) => !balanceByChatId.has(g.id)).sort(byLastActiveDesc);

  const toggleDetail = () => setShowDetail((v) => !v);

  const renderGroup = (group: Group, settledRow: boolean) => {
    const balance = balanceByChatId.get(group.id);
    return (
      <List.Item
        key={group.id}
        icon={settledRow ? { source: Icon.TwoPeople, tintColor: Color.SecondaryText } : Icon.TwoPeople}
        title={group.title}
        subtitle={showDetail ? undefined : (CHAT_TYPE_LABEL[group.type] ?? group.type)}
        accessories={showDetail ? undefined : balance ? balanceAccessories(balance) : [{ text: group.baseCurrency }]}
        detail={
          <GroupDetail
            group={group}
            lastActive={lastActiveOf(group)}
            recentExpenses={expensesOf(group).slice(0, 12)}
            categories={categoriesOf(group)}
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

      <List.Section title="Active" subtitle={`${active.length}`}>
        {active.map((group) => renderGroup(group, false))}
      </List.Section>

      <List.Section title="Settled" subtitle={`${settled.length}`}>
        {settled.map((group) => renderGroup(group, true))}
      </List.Section>
    </List>
  );
}
