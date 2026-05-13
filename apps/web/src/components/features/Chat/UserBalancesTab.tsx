import { useState } from "react";
import {
  Avatar,
  Caption,
  Cell,
  Section,
  Skeleton,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { trpc } from "@/utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import {
  getCurrencyDecimalDigits,
  getCurrencySymbol,
} from "@dko/trpc/src/utils/currencyApi";
import { CounterpartyBalanceSheet } from "./CounterpartyBalanceSheet";

function fmt(n: number, ccy: string): string {
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n).toFixed(getCurrencyDecimalDigits(ccy));
  return `${sign} ${getCurrencySymbol(ccy)}${abs}`;
}

interface Props {
  initialBaseCurrency: string;
}

export default function UserBalancesTab({ initialBaseCurrency }: Props) {
  const [openUserId, setOpenUserId] = useState<number | null>(null);

  const q = trpc.expenseShare.getMyCounterpartyBalances.useQuery({
    baseCurrency: initialBaseCurrency,
  });

  const data = q.data;
  const counterparties = data?.counterparties ?? [];

  const youOwe = counterparties.filter((c) => c.totalBaseNet < 0);
  const owesYou = counterparties.filter((c) => c.totalBaseNet > 0);

  const open =
    openUserId !== null
      ? (counterparties.find((c) => c.userId === openUserId) ?? null)
      : null;

  const renderRow = (c: (typeof counterparties)[number]) => {
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
    const groupsText =
      c.groups.length === 1
        ? c.groups[0].chatTitle
        : `${c.groups.length} groups`;
    return (
      <Cell
        key={c.userId}
        before={<ChatMemberAvatar userId={c.userId} size={40} />}
        subtitle={groupsText}
        after={
          <Text
            className={c.totalBaseNet > 0 ? "text-green-500" : "text-red-500"}
          >
            {fmt(c.totalBaseNet, initialBaseCurrency)}
          </Text>
        }
        onClick={() => {
          hapticFeedback.impactOccurred.ifAvailable("light");
          setOpenUserId(c.userId);
        }}
      >
        {fullName}
      </Cell>
    );
  };

  const skeletonRows = Array.from({ length: 2 }).map((_, i) => (
    <Cell
      key={`skeleton-${i}`}
      before={<Avatar size={40} />}
      after={
        <Skeleton visible>
          <Text>Loading...</Text>
        </Skeleton>
      }
      subhead={
        <Skeleton visible>
          <Text>Loading...</Text>
        </Skeleton>
      }
    >
      <Skeleton visible>
        <Text>Loading...</Text>
      </Skeleton>
    </Cell>
  ));

  return (
    <section className="pb-24">
      <div className="mt-4 flex flex-col gap-2 px-4">
        <Section
          header={
            <Title weight="2" className="px-1 py-2" level="3">
              🚨 You owe
            </Title>
          }
        >
          {q.isLoading ? skeletonRows : null}
          {!q.isLoading && !q.isError && youOwe.map(renderRow)}
          {!q.isLoading && !q.isError && youOwe.length === 0 ? (
            <div className="flex h-16 items-center justify-center">
              <Caption className="text-center text-gray-500" weight="1">
                🔥 You are all settled
              </Caption>
            </div>
          ) : null}
        </Section>

        <Section
          header={
            <Title weight="2" className="px-1 py-2" level="3">
              🤑 Owes you
            </Title>
          }
        >
          {q.isLoading ? skeletonRows : null}
          {!q.isLoading && !q.isError && owesYou.map(renderRow)}
          {!q.isLoading && !q.isError && owesYou.length === 0 ? (
            <div className="flex h-16 items-center justify-center">
              <Caption className="text-center text-gray-500" weight="1">
                💁 No one owes you
              </Caption>
            </div>
          ) : null}
        </Section>

        {q.isError && (
          <Section>
            <Cell>Failed to load balances. Pull to refresh.</Cell>
          </Section>
        )}
      </div>

      <CounterpartyBalanceSheet
        open={open !== null}
        counterparty={open}
        baseCurrency={data?.baseCurrency ?? initialBaseCurrency}
        ratesAsOf={data?.ratesAsOf ?? null}
        onOpenChange={(o) => !o && setOpenUserId(null)}
        onAfterMutate={() => q.refetch()}
      />
    </section>
  );
}
