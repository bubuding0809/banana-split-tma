import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { getTrpcClient } from "./lib/trpc";
import { formatAmount } from "./lib/format";
import { type Category, groupByMonth, type Txn } from "./lib/transactions";
import { TransactionDetailView } from "./transaction-detail";

/** Raw expense row from getAllExpensesByChat (its output schema is z.any()). */
type RawExpense = {
  id: string;
  date: Date;
  description: string;
  amount: number;
  currency: string;
  payerId: number;
  splitMode: string;
  recurringTemplateId: string | null;
  categoryId: string | null;
  shares: { userId: number; amount: number }[];
};

/** How many transaction rows to reveal per scroll-triggered page. */
const PAGE_SIZE = 50;

const FILTER_ALL = "all";
const FILTER_UNCATEGORIZED = "uncategorized";

export function GroupTransactions(props: { chatId: number; title: string }) {
  const { chatId, title } = props;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState(FILTER_ALL);

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
      />
      {months.map((bucket) => (
        <List.Section key={bucket.month} title={bucket.month} subtitle={`${bucket.txns.length}`}>
          {bucket.txns.map((txn) => (
            <TransactionRow
              key={`${txn.kind}-${txn.id}`}
              txn={txn}
              nameOf={nameOf}
              myUserId={myUserId}
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
  onRefresh: () => void;
}) {
  const { txn, nameOf, myUserId, onRefresh } = props;
  const isExpense = txn.kind === "expense";
  const total = `${formatAmount(txn.amount)} ${txn.currency}`;

  const icon = isExpense
    ? (txn.category?.emoji ?? { source: Icon.Receipt, tintColor: Color.Orange })
    : { source: Icon.ArrowRight, tintColor: Color.Blue };

  // Expenses where the caller is a participant show "your share / total".
  const accessories: List.Item.Accessory[] =
    isExpense && txn.myShare != null
      ? [
          {
            tag: { value: formatAmount(txn.myShare), color: Color.Orange },
            tooltip: "Your share",
          },
          { text: `of ${total}` },
          { date: txn.date },
        ]
      : [
          {
            tag: {
              value: total,
              color: isExpense ? Color.Orange : Color.Blue,
            },
          },
          { date: txn.date },
        ];

  return (
    <List.Item
      icon={icon}
      title={isExpense ? txn.description : `${nameOf(txn.senderId)} → ${nameOf(txn.receiverId)}`}
      subtitle={isExpense ? `Paid by ${nameOf(txn.payerId)}` : (txn.description ?? "Settlement")}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action.Push
            title="View Details"
            icon={Icon.Eye}
            target={<TransactionDetailView txn={txn} nameOf={nameOf} myUserId={myUserId} />}
          />
          <Action.CopyToClipboard title="Copy Amount" content={total} />
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
