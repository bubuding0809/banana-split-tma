import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { getTrpcClient } from "./lib/trpc";
import { formatAmount, formatRelativeShort } from "./lib/format";
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
  const { person, baseCurrency, showDetail, onToggleDetail, onRefresh } = props;
  return (
    <List.Item
      icon={{ source: Icon.Person, tintColor: person.totalBaseNet > 0 ? Color.Green : Color.Red }}
      title={counterpartyName(person)}
      accessories={[netAccessory(person.totalBaseNet, baseCurrency)]}
      detail={<PersonDetailPane person={person} baseCurrency={baseCurrency} />}
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
