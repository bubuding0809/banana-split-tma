import { Action, ActionPanel, Alert, Color, confirmAlert, Icon, List, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { getTrpcClient } from "./lib/trpc";
import { formatAmount, formatShortDate } from "./lib/format";
import { type Category, groupByMonth, type Txn } from "./lib/transactions";
import { TransactionDetailPane } from "./transaction-detail";
import { AddExpenseForm } from "./add-expense";

/** Raw expense row from getAllExpensesByChat (its output schema is z.any()). */
type RawExpense = {
  id: string;
  date: Date;
  description: string;
  amount: number;
  currency: string;
  payerId: number;
  creatorId: number;
  splitMode: string;
  recurringTemplateId: string | null;
  categoryId: string | null;
  shares: { userId: number; amount: number }[];
};

/** How many transaction rows to reveal per scroll-triggered page. */
const PAGE_SIZE = 50;

const FILTER_ALL = "all";
const FILTER_UNCATEGORIZED = "uncategorized";

export function GroupTransactions(props: { chatId: number; title: string; baseCurrency: string }) {
  const { chatId, title, baseCurrency } = props;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState(FILTER_ALL);
  const [showDetail, setShowDetail] = useState(true);

  const { isLoading, data, revalidate } = usePromise(
    async (id: number) => {
      const trpc = getTrpcClient();
      const [expensesRaw, settlements, membersRaw, categoryList, me] = await Promise.all([
        trpc.expense.getAllExpensesByChat.query({ chatId: id }),
        trpc.settlement.getAllSettlementsByChat.query({ chatId: id }),
        trpc.chat.getMembers.query({ chatId: id }),
        trpc.category.listByChat.query({ chatId: id }).catch(() => ({ items: [] as Category[] })),
        // getMe may not be deployed yet — degrade to "no share" rather than fail.
        trpc.user.getMe.query().catch(() => null),
      ]);

      const myUserId = me?.id ?? null;

      const categoryById = new Map<string, Category>();
      for (const c of categoryList.items) {
        categoryById.set(c.id, { id: c.id, emoji: c.emoji, title: c.title });
      }

      const nameById = new Map<number, string>();
      for (const member of membersRaw ?? []) {
        const name =
          [member.firstName, member.lastName].filter(Boolean).join(" ") || member.username || `User ${member.id}`;
        nameById.set(Number(member.id), name);
      }

      const expenses: Txn[] = (expensesRaw as RawExpense[]).map((e) => ({
        kind: "expense",
        id: e.id,
        date: e.date,
        description: e.description,
        amount: e.amount,
        currency: e.currency,
        payerId: e.payerId,
        creatorId: e.creatorId,
        splitMode: e.splitMode,
        recurring: Boolean(e.recurringTemplateId),
        shares: e.shares.map((s) => ({ userId: s.userId, amount: s.amount })),
        category: e.categoryId ? (categoryById.get(e.categoryId) ?? null) : null,
        myShare: myUserId == null ? null : (e.shares.find((s) => s.userId === myUserId)?.amount ?? null),
      }));

      const transfers: Txn[] = settlements.map((s) => ({
        kind: "settlement",
        id: s.id,
        date: s.date,
        description: s.description,
        amount: s.amount,
        currency: s.currency,
        senderId: s.senderId,
        receiverId: s.receiverId,
      }));

      const txns = [...expenses, ...transfers].sort((a, b) => b.date.getTime() - a.date.getTime());

      // Categories actually used by this group's expenses — drives the filter.
      const present = new Map<string, Category>();
      for (const e of expenses) {
        if (e.kind === "expense" && e.category) {
          present.set(e.category.id, e.category);
        }
      }
      const categoriesPresent = [...present.values()].sort((a, b) => a.title.localeCompare(b.title));
      const hasUncategorized = expenses.some((e) => e.kind === "expense" && e.category === null);

      return { txns, nameById, myUserId, categoriesPresent, hasUncategorized };
    },
    [chatId],
  );

  const txns = data?.txns ?? [];
  const nameById = data?.nameById;
  const myUserId = data?.myUserId ?? null;
  const categoriesPresent = data?.categoriesPresent ?? [];
  const hasUncategorized = data?.hasUncategorized ?? false;
  const nameOf = (userId: number) => nameById?.get(userId) ?? `User ${userId}`;

  const filtered = txns.filter((t) => {
    if (filter === FILTER_ALL) return true;
    if (t.kind === "settlement") return false;
    if (filter === FILTER_UNCATEGORIZED) return t.category === null;
    return t.category?.id === filter;
  });

  // The backend returns every transaction in one request, so this paginates
  // the *render* — revealing PAGE_SIZE more rows each time the user scrolls.
  const months = groupByMonth(filtered.slice(0, visibleCount));
  const pagination = {
    pageSize: PAGE_SIZE,
    hasMore: visibleCount < filtered.length,
    onLoadMore: () => setVisibleCount((count) => count + PAGE_SIZE),
  };

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail && txns.length > 0}
      pagination={pagination}
      navigationTitle={title}
      searchBarPlaceholder={`Search transactions in ${title}…`}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by category"
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <List.Dropdown.Item title="All Transactions" value={FILTER_ALL} icon={Icon.List} />
          {categoriesPresent.length > 0 ? (
            <List.Dropdown.Section title="Categories">
              {categoriesPresent.map((c) => (
                <List.Dropdown.Item key={c.id} title={c.title} value={c.id} icon={c.emoji} />
              ))}
            </List.Dropdown.Section>
          ) : null}
          {hasUncategorized ? (
            <List.Dropdown.Item title="Uncategorized" value={FILTER_UNCATEGORIZED} icon={Icon.Receipt} />
          ) : null}
        </List.Dropdown>
      }
    >
      <List.EmptyView
        icon={Icon.Receipt}
        title={isLoading ? "Loading transactions…" : "No transactions"}
        description={isLoading ? undefined : "Nothing matches this filter, or the group has no activity yet."}
        actions={
          <ActionPanel>
            <Action.Push
              title="Add Expense"
              icon={Icon.Plus}
              target={
                <AddExpenseForm chatId={chatId} baseCurrency={baseCurrency} groupTitle={title} onCreated={revalidate} />
              }
            />
          </ActionPanel>
        }
      />
      {months.map((bucket) => (
        <List.Section key={bucket.month} title={bucket.month} subtitle={`${bucket.txns.length}`}>
          {bucket.txns.map((txn) => (
            <TransactionRow
              key={`${txn.kind}-${txn.id}`}
              txn={txn}
              nameOf={nameOf}
              myUserId={myUserId}
              chatId={chatId}
              baseCurrency={baseCurrency}
              groupTitle={title}
              showDetail={showDetail}
              onToggleDetail={() => setShowDetail((v) => !v)}
              onRefresh={revalidate}
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

function TransactionRow(props: {
  txn: Txn;
  nameOf: (userId: number) => string;
  myUserId: number | null;
  chatId: number;
  baseCurrency: string;
  groupTitle: string;
  showDetail: boolean;
  onToggleDetail: () => void;
  onRefresh: () => void;
}) {
  const { txn, nameOf, myUserId, chatId, baseCurrency, groupTitle, showDetail, onToggleDetail, onRefresh } = props;
  const isExpense = txn.kind === "expense";
  const total = `${formatAmount(txn.amount)} ${txn.currency}`;

  const icon = isExpense
    ? (txn.category?.emoji ?? { source: Icon.Receipt, tintColor: Color.Orange })
    : { source: Icon.ArrowRight, tintColor: Color.Blue };

  // The caller's share (or the total, when the share is unknown) — kept
  // visible even with the detail pane open, as a single compact chip.
  const amountChip: List.Item.Accessory =
    isExpense && txn.myShare != null
      ? {
          tag: {
            value: `${formatAmount(txn.myShare)} ${txn.currency}`,
            color: Color.Orange,
          },
          tooltip: "Your share",
        }
      : {
          tag: {
            value: total,
            color: isExpense ? Color.Orange : Color.Blue,
          },
        };

  // Wide layout (detail pane hidden) adds the total and date around the chip.
  const fullAccessories: List.Item.Accessory[] =
    isExpense && txn.myShare != null
      ? [{ text: total }, amountChip, { text: formatShortDate(txn.date) }]
      : [amountChip, { text: formatShortDate(txn.date) }];

  async function handleDelete() {
    const kind = isExpense ? "expense" : "settlement";
    const confirmed = await confirmAlert({
      title: `Delete this ${kind}?`,
      message: txn.kind === "expense" ? `"${txn.description}" — this can't be undone.` : "This can't be undone.",
      icon: Icon.Trash,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Deleting ${kind}…`,
    });
    try {
      const trpc = getTrpcClient();
      if (txn.kind === "expense") {
        await trpc.expense.deleteExpense.mutate({ expenseId: txn.id });
      } else {
        await trpc.settlement.deleteSettlement.mutate({ settlementId: txn.id });
      }
      toast.style = Toast.Style.Success;
      toast.title = `Deleted ${kind}`;
      onRefresh();
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = `Failed to delete ${kind}`;
      toast.message = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <List.Item
      icon={icon}
      title={isExpense ? txn.description : `${nameOf(txn.senderId)} → ${nameOf(txn.receiverId)}`}
      accessories={showDetail ? [amountChip] : fullAccessories}
      detail={<TransactionDetailPane txn={txn} nameOf={nameOf} myUserId={myUserId} />}
      actions={
        <ActionPanel>
          {txn.kind === "expense" ? (
            <Action.Push
              title="Edit Expense"
              icon={Icon.Pencil}
              target={
                <AddExpenseForm
                  chatId={chatId}
                  baseCurrency={baseCurrency}
                  groupTitle={groupTitle}
                  expense={txn}
                  onCreated={onRefresh}
                />
              }
            />
          ) : null}
          <Action.CopyToClipboard title="Copy Amount" content={total} />
          <Action
            title={showDetail ? "Hide Details" : "Show Details"}
            icon={Icon.Sidebar}
            onAction={onToggleDetail}
            shortcut={{ modifiers: ["cmd"], key: "d" }}
          />
          <Action.Push
            title="Add Expense"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            target={
              <AddExpenseForm
                chatId={chatId}
                baseCurrency={baseCurrency}
                groupTitle={groupTitle}
                onCreated={onRefresh}
              />
            }
          />
          <Action
            title={`Delete ${isExpense ? "Expense" : "Settlement"}`}
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            onAction={handleDelete}
            shortcut={{ modifiers: ["ctrl"], key: "x" }}
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
