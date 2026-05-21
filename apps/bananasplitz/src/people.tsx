import { Action, ActionPanel, Alert, Color, confirmAlert, Icon, List, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { getTrpcClient } from "./lib/trpc";
import { formatAmount, formatRelativeShort } from "./lib/format";
import { type Counterparty, counterpartyName } from "./lib/balances";
import { CounterpartyGroups } from "./counterparty-groups";

/** Net chip: green when they owe you, red when you owe them. No +/- sign. */
function netAccessory(totalBaseNet: number, baseCurrency: string): List.Item.Accessory {
  return {
    tag: {
      value: `${formatAmount(totalBaseNet)} ${baseCurrency}`,
      color: totalBaseNet > 0 ? Color.Green : Color.Red,
    },
  };
}

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

function PersonRow(props: {
  person: Counterparty;
  baseCurrency: string;
  myUserId: number | null;
  showDetail: boolean;
  onToggleDetail: () => void;
  onRefresh: () => void;
}) {
  const { person, baseCurrency, myUserId, showDetail, onToggleDetail, onRefresh } = props;

  const name = counterpartyName(person);
  const owesYou = person.totalBaseNet > 0;
  // Hoisted into a local so TS narrows `number` for the cooldown branch below.
  const cooldownUntil = person.nudgeCooldownUntil;
  const onCooldown = cooldownUntil != null && cooldownUntil > Date.now();

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
        message: `Try again in ${formatRelativeShort(cooldownUntil - Date.now())}.`,
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
      // The `onCooldown` guard above is best-effort — it reads the last
      // loaded snapshot. The backend is authoritative and rejects a repeat
      // nudge with TOO_MANY_REQUESTS; surface that as the friendly message.
      const message = err instanceof Error ? err.message : String(err);
      const isCooldown = err instanceof Error && /TOO_MANY_REQUESTS|already nudged/i.test(message);
      toast.style = Toast.Style.Failure;
      toast.title = isCooldown ? "Already nudged" : "Failed to nudge";
      toast.message = message;
    }
  }

  return (
    <List.Item
      icon={{ source: Icon.Person, tintColor: person.totalBaseNet > 0 ? Color.Green : Color.Red }}
      title={counterpartyName(person)}
      accessories={[netAccessory(person.totalBaseNet, baseCurrency)]}
      detail={<PersonDetailPane person={person} baseCurrency={baseCurrency} />}
      actions={
        <ActionPanel>
          <Action title="Settle All" icon={Icon.Check} onAction={handleSettleAll} />
          {owesYou ? (
            <Action
              title="Nudge"
              icon={Icon.AlarmRinging}
              onAction={handleNudge}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
            />
          ) : null}
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
  const byMagnitude = (a: Counterparty, b: Counterparty) => Math.abs(b.totalBaseNet) - Math.abs(a.totalBaseNet);
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
