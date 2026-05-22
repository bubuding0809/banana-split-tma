import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { getTrpcClient } from "./lib/trpc";
import type { ExpenseTxn } from "./lib/transactions";

type SplitMode = "EQUAL" | "SHARES" | "EXACT";

const SPLIT_MODES: { value: SplitMode; title: string }[] = [
  { value: "EQUAL", title: "Equal — split evenly" },
  { value: "SHARES", title: "Shares — split by share count" },
  { value: "EXACT", title: "Exact — exact amount each" },
];

/** The expense form supports 3 modes; coerce anything else to EQUAL. */
function toSplitMode(mode: string | undefined): SplitMode {
  return mode === "SHARES" || mode === "EXACT" ? mode : "EQUAL";
}

type Member = { id: number; name: string };
type CategoryOption = { id: string; emoji: string; title: string };

type FormProps = {
  chatId: number;
  baseCurrency: string;
  groupTitle: string;
  expense?: ExpenseTxn;
  onCreated?: () => void;
};

/**
 * Create or edit an expense. This loader fetches members/categories/me, then
 * mounts the form body only once they're ready — so the body's state can
 * initialize synchronously and a controlled TagPicker default actually sticks.
 */
export function AddExpenseForm(props: FormProps) {
  const { isLoading, data } = usePromise(
    async (id: number) => {
      const trpc = getTrpcClient();
      const [membersRaw, categoryList, me] = await Promise.all([
        trpc.chat.getMembers.query({ chatId: id }),
        trpc.category.listByChat.query({ chatId: id }).catch(() => ({ items: [] as CategoryOption[] })),
        trpc.user.getMe.query().catch(() => null),
      ]);
      const members: Member[] = (membersRaw ?? []).map((m) => ({
        id: Number(m.id),
        name: [m.firstName, m.lastName].filter(Boolean).join(" ") || m.username || `User ${m.id}`,
      }));
      return {
        members,
        categories: categoryList.items,
        myUserId: me?.id ?? null,
      };
    },
    [props.chatId],
  );

  if (!data) {
    return (
      <Form isLoading={isLoading} navigationTitle={`${props.expense ? "Edit" : "Add"} Expense · ${props.groupTitle}`} />
    );
  }

  return <ExpenseFormBody {...props} members={data.members} categories={data.categories} myUserId={data.myUserId} />;
}

function ExpenseFormBody(
  props: FormProps & {
    members: Member[];
    categories: CategoryOption[];
    myUserId: number | null;
  },
) {
  const { chatId, baseCurrency, groupTitle, expense: editing, onCreated, members, categories, myUserId } = props;
  const { pop } = useNavigation();

  // All state initializes synchronously — members are already loaded here.
  const [description, setDescription] = useState(editing?.description ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [currency, setCurrency] = useState(editing?.currency ?? baseCurrency);
  const [categoryId, setCategoryId] = useState(editing?.category?.id ?? "");
  const [payerId, setPayerId] = useState(String(editing?.payerId ?? myUserId ?? members[0]?.id ?? ""));
  const [date, setDate] = useState<Date | null>(editing?.date ?? new Date());
  const [splitMode, setSplitMode] = useState<SplitMode>(toSplitMode(editing?.splitMode));
  // Add mode starts empty (easier to add than to remove); edit mode keeps
  // the expense's existing participant set.
  const [participants, setParticipants] = useState<string[]>(
    editing ? editing.shares.map((s) => String(s.userId)) : [],
  );
  const [splitInputs, setSplitInputs] = useState<Record<string, string>>(() =>
    editing ? Object.fromEntries(editing.shares.map((s) => [String(s.userId), String(s.amount)])) : {},
  );

  const memberName = (id: string) => members.find((m) => String(m.id) === id)?.name ?? `User ${id}`;

  const allSelected = members.length > 0 && participants.length === members.length;

  async function handleSubmit() {
    const amountNum = Number(amount);
    if (!description.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Description is required",
      });
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Enter a valid amount",
      });
      return;
    }
    if (participants.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Pick at least one participant",
      });
      return;
    }
    if (!editing && myUserId == null) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't identify you",
        message: "user.getMe failed — the creator is unknown.",
      });
      return;
    }
    if (!payerId) {
      await showToast({ style: Toast.Style.Failure, title: "Pick who paid" });
      return;
    }
    if (date && date.getTime() > Date.now()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Date can't be in the future",
      });
      return;
    }

    let customSplits: { userId: number; amount: number }[] | undefined;
    if (splitMode !== "EQUAL") {
      customSplits = participants.map((pid) => ({
        userId: Number(pid),
        amount: Number(splitInputs[pid] ?? ""),
      }));
      if (customSplits.some((s) => !Number.isFinite(s.amount) || s.amount <= 0)) {
        await showToast({
          style: Toast.Style.Failure,
          title: splitMode === "SHARES" ? "Every participant needs a share count" : "Every participant needs an amount",
        });
        return;
      }
      if (splitMode === "EXACT") {
        const sum = customSplits.reduce((acc, s) => acc + s.amount, 0);
        if (Math.abs(sum - amountNum) > 0.01) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Exact splits must equal the total",
            message: `Splits sum to ${sum.toFixed(2)}, amount is ${amountNum.toFixed(2)}.`,
          });
          return;
        }
      }
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: editing ? "Saving changes…" : "Creating expense…",
    });
    try {
      const trpc = getTrpcClient();
      const common = {
        chatId,
        payerId: Number(payerId),
        description: description.trim(),
        amount: amountNum,
        currency: currency.trim() || baseCurrency,
        date: date ?? new Date(),
        splitMode,
        participantIds: participants.map(Number),
        customSplits,
        categoryId: categoryId || null,
        sendNotification: true,
      };
      if (editing) {
        await trpc.expense.updateExpense.mutate({
          ...common,
          expenseId: editing.id,
          creatorId: editing.creatorId,
        });
        toast.title = "Expense updated";
      } else {
        await trpc.expense.createExpense.mutate({
          ...common,
          creatorId: myUserId as number,
        });
        toast.title = "Expense created";
      }
      toast.style = Toast.Style.Success;
      onCreated?.();
      pop();
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = editing ? "Failed to save expense" : "Failed to create expense";
      toast.message = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <Form
      navigationTitle={`${editing ? "Edit" : "Add"} Expense · ${groupTitle}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={editing ? "Save Changes" : "Create Expense"}
            icon={editing ? Icon.Check : Icon.Plus}
            onSubmit={handleSubmit}
          />
          <Action
            title={allSelected ? "Deselect All Participants" : "Select All Participants"}
            icon={allSelected ? Icon.Circle : Icon.CheckCircle}
            shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
            onAction={() => setParticipants(allSelected ? [] : members.map((m) => String(m.id)))}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="description"
        title="Description"
        placeholder="Dinner at Marche"
        value={description}
        onChange={setDescription}
      />
      <Form.TextField id="amount" title="Amount" placeholder="0.00" value={amount} onChange={setAmount} />
      <Form.TextField
        id="currency"
        title="Currency"
        placeholder={baseCurrency}
        value={currency}
        onChange={setCurrency}
      />
      <Form.Dropdown id="category" title="Category" value={categoryId} onChange={setCategoryId}>
        <Form.Dropdown.Item value="" title="No category" />
        {categories.map((c) => (
          <Form.Dropdown.Item key={c.id} value={c.id} title={`${c.emoji}  ${c.title}`} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="payer" title="Paid by" value={payerId} onChange={setPayerId}>
        {members.map((m) => (
          <Form.Dropdown.Item key={m.id} value={String(m.id)} title={m.name} />
        ))}
      </Form.Dropdown>
      <Form.DatePicker id="date" title="Date" type={Form.DatePicker.Type.Date} value={date} onChange={setDate} />

      <Form.Separator />

      <Form.Dropdown id="splitMode" title="Split" value={splitMode} onChange={(v) => setSplitMode(v as SplitMode)}>
        {SPLIT_MODES.map((s) => (
          <Form.Dropdown.Item key={s.value} value={s.value} title={s.title} />
        ))}
      </Form.Dropdown>
      <Form.TagPicker id="participants" title="Participants" value={participants} onChange={setParticipants}>
        {members.map((m) => (
          <Form.TagPicker.Item key={m.id} value={String(m.id)} title={m.name} />
        ))}
      </Form.TagPicker>
      {splitMode !== "EQUAL"
        ? participants.map((pid) => (
            <Form.TextField
              key={pid}
              id={`split-${pid}`}
              title={memberName(pid)}
              placeholder={splitMode === "SHARES" ? "share count (e.g. 1)" : `amount in ${currency}`}
              value={splitInputs[pid] ?? ""}
              onChange={(v) => setSplitInputs((s) => ({ ...s, [pid]: v }))}
            />
          ))
        : null}
    </Form>
  );
}
