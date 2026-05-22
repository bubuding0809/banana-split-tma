import { Color, List } from "@raycast/api";
import { formatAmount, formatDate } from "./lib/format";
import type { Txn } from "./lib/transactions";

/**
 * Inline detail pane shown beside a transaction row — structured metadata,
 * matching the group detail pane's style (amounts as chips).
 */
export function TransactionDetailPane(props: {
  txn: Txn;
  nameOf: (userId: number) => string;
  myUserId: number | null;
}) {
  const { txn, nameOf, myUserId } = props;
  const Metadata = List.Item.Detail.Metadata;
  const amount = `${formatAmount(txn.amount)} ${txn.currency}`;

  if (txn.kind === "settlement") {
    return (
      <List.Item.Detail
        metadata={
          <Metadata>
            <Metadata.TagList title="Amount">
              <Metadata.TagList.Item text={amount} />
            </Metadata.TagList>
            <Metadata.Label title="From" text={nameOf(txn.senderId)} />
            <Metadata.Label title="To" text={nameOf(txn.receiverId)} />
            <Metadata.Label title="Date" text={formatDate(txn.date)} />
            {txn.description ? <Metadata.Label title="Note" text={txn.description} /> : null}
          </Metadata>
        }
      />
    );
  }

  const ways = txn.shares.length;

  return (
    <List.Item.Detail
      metadata={
        <Metadata>
          <Metadata.TagList title="Amount">
            <Metadata.TagList.Item text={amount} />
          </Metadata.TagList>
          <Metadata.Label title="Paid by" text={nameOf(txn.payerId)} />
          <Metadata.Label title="Date" text={formatDate(txn.date)} />
          {txn.category ? (
            <Metadata.Label title="Category" text={`${txn.category.emoji} ${txn.category.title}`} />
          ) : null}
          {txn.recurring ? <Metadata.Label title="Recurring" text="Yes" /> : null}
          <Metadata.Separator />
          {ways > 0 ? (
            <Metadata.TagList title={`${txn.splitMode} split · ${ways} ${ways === 1 ? "way" : "ways"}`}>
              {txn.shares.map((s) => (
                <Metadata.TagList.Item
                  key={s.userId}
                  text={`${nameOf(s.userId)} · ${formatAmount(s.amount)} ${txn.currency}`}
                  color={s.userId === myUserId ? Color.Orange : undefined}
                />
              ))}
            </Metadata.TagList>
          ) : (
            <Metadata.Label title="Split" text="No breakdown available" />
          )}
        </Metadata>
      }
    />
  );
}
