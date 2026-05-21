import { Action, ActionPanel, Alert, Color, confirmAlert, Icon, List, showToast, Toast } from "@raycast/api";
import { getTrpcClient } from "./lib/trpc";
import { formatAmount } from "./lib/format";
import { bucketGroupsByChat, type ChatBucket, type Counterparty, counterpartyName } from "./lib/balances";

/**
 * Per-chat settle view for one counterparty. Each row is a chat; settling a
 * row records settlements for every currency in that chat.
 */
export function CounterpartyGroups(props: {
  person: Counterparty;
  myUserId: number | null;
  myName: string | null;
  onSettled: () => void;
}) {
  const { person, myUserId, myName, onSettled } = props;
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
          myName={myName}
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
  myName: string | null;
  onSettled: () => void;
}) {
  const { bucket, person, myUserId, myName, onSettled } = props;
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

    // settleAllDebts only sends its Telegram notification when both names
    // are supplied; pass them so the counterparty is actually notified.
    const calls: {
      senderId: number;
      receiverId: number;
      balances: { currency: string; amount: number }[];
      creditorName?: string;
      debtorName?: string;
    }[] = [];
    if (youAreCreditor.length > 0) {
      calls.push({
        senderId: person.userId,
        receiverId: myUserId,
        balances: youAreCreditor.map((c) => ({ currency: c.currency, amount: Math.abs(c.nativeNet) })),
        creditorName: myName ?? undefined,
        debtorName: name,
      });
    }
    if (youAreDebtor.length > 0) {
      calls.push({
        senderId: myUserId,
        receiverId: person.userId,
        balances: youAreDebtor.map((c) => ({ currency: c.currency, amount: Math.abs(c.nativeNet) })),
        creditorName: name,
        debtorName: myName ?? undefined,
      });
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: "Settling group…" });
    const trpc = getTrpcClient();
    // The directional calls aren't atomic — track how many landed so a
    // failure on the second one is reported (and refreshed) as partial.
    let completed = 0;
    try {
      for (const call of calls) {
        await trpc.settlement.settleAllDebts.mutate({
          chatId: bucket.chatId,
          senderId: call.senderId,
          receiverId: call.receiverId,
          balances: call.balances,
          creditorName: call.creditorName,
          debtorName: call.debtorName,
          sendNotification: true,
        });
        completed += 1;
      }
      toast.style = Toast.Style.Success;
      toast.title = `Settled ${bucket.chatTitle}`;
      onSettled();
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.message = err instanceof Error ? err.message : String(err);
      if (completed > 0) {
        // Part of the chat already settled — refresh so the list is honest.
        toast.title = "Partly settled — some balances remain";
        onSettled();
      } else {
        toast.title = "Failed to settle group";
      }
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
