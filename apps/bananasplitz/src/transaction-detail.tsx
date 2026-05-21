import { Action, ActionPanel, Detail } from "@raycast/api";
import { formatAmount, formatDate } from "./lib/format";
import type { Txn } from "./lib/transactions";

/** Full-page detail for a single transaction, pushed from the transactions list. */
export function TransactionDetailView(props: {
  txn: Txn;
  nameOf: (userId: number) => string;
  myUserId: number | null;
}) {
  const { txn, nameOf, myUserId } = props;
  const amount = `${formatAmount(txn.amount)} ${txn.currency}`;

  const markdown =
    txn.kind === "settlement"
      ? settlementMarkdown(txn, nameOf, amount)
      : expenseMarkdown(txn, nameOf, amount, myUserId);

  return (
    <Detail
      navigationTitle={txn.kind === "expense" ? txn.description : "Settlement"}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Amount" content={amount} />
          <Action.CopyToClipboard title="Copy Transaction ID" content={txn.id} />
        </ActionPanel>
      }
    />
  );
}

function expenseMarkdown(
  txn: Extract<Txn, { kind: "expense" }>,
  nameOf: (userId: number) => string,
  amount: string,
  myUserId: number | null,
): string {
  const chips = [
    "`Expense`",
    `\`${formatDate(txn.date)}\``,
    `\`${txn.splitMode} split\``,
    ...(txn.category ? [`\`${txn.category.emoji} ${txn.category.title}\``] : []),
    ...(txn.recurring ? ["`Recurring`"] : []),
  ].join("  ·  ");

  const splitRows = txn.shares.length
    ? [
        `| Member | Share |`,
        `| --- | --- |`,
        ...txn.shares.map((s) => {
          const cell = `${nameOf(s.userId)} | ${formatAmount(s.amount)} ${txn.currency}`;
          // Bold the caller's own row.
          return s.userId === myUserId
            ? `| **${nameOf(s.userId)}** | **${formatAmount(s.amount)} ${txn.currency}** |`
            : `| ${cell} |`;
        }),
      ].join("\n")
    : "_No share breakdown available._";

  return [
    `# ${txn.description}`,
    ``,
    `## ${amount}`,
    ``,
    `Paid by **${nameOf(txn.payerId)}**`,
    ...(txn.myShare != null ? [``, `Your share · **${formatAmount(txn.myShare)} ${txn.currency}**`] : []),
    ``,
    chips,
    ``,
    `---`,
    ``,
    `### Split ${txn.shares.length} way${txn.shares.length === 1 ? "" : "s"}`,
    ``,
    splitRows,
  ].join("\n");
}

function settlementMarkdown(
  txn: Extract<Txn, { kind: "settlement" }>,
  nameOf: (userId: number) => string,
  amount: string,
): string {
  return [
    `# Settlement`,
    ``,
    `## ${amount}`,
    ``,
    `**${nameOf(txn.senderId)}**  →  **${nameOf(txn.receiverId)}**`,
    ``,
    "`Settlement`  ·  " + `\`${formatDate(txn.date)}\``,
    ...(txn.description ? ["", `> ${txn.description}`] : []),
  ].join("\n");
}
