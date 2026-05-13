import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Caption,
  Cell,
  Navigation,
  Section,
  Skeleton,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { cn } from "@/utils/cn";
import { trpc } from "@/utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import {
  formatCurrencyWithCode,
  getBalanceColorClass,
} from "@/utils/financial";
import { CounterpartyBalanceSheet } from "./CounterpartyBalanceSheet";

interface Props {
  initialBaseCurrency: string;
  /**
   * When set (via the cross-group DM deep link), auto-opens the
   * CounterpartyBalanceSheet for this user once the counterparty list
   * has loaded. Consumed once per session so a back-navigation doesn't
   * re-open the sheet.
   */
  autoOpenCounterpartyId?: string;
}

export default function UserBalancesTab({
  initialBaseCurrency,
  autoOpenCounterpartyId,
}: Props) {
  const [openUserId, setOpenUserId] = useState<number | null>(null);
  const autoOpenConsumed = useRef(false);

  const q = trpc.expenseShare.getMyCounterpartyBalances.useQuery({
    baseCurrency: initialBaseCurrency,
  });
  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  const currencyMap = useMemo(() => {
    if (!supportedCurrencies) return new Map();
    return new Map(supportedCurrencies.map((c) => [c.code, c] as const));
  }, [supportedCurrencies]);

  const counterparties = q.data?.counterparties ?? [];

  // Auto-open sheet from cross-group DM deep link.
  useEffect(() => {
    if (autoOpenConsumed.current) return;
    if (!autoOpenCounterpartyId) return;
    if (!q.data) return; // wait for list to load before deciding
    const target = Number(autoOpenCounterpartyId);
    if (!Number.isFinite(target)) {
      autoOpenConsumed.current = true;
      return;
    }
    const hit = counterparties.find((c) => c.userId === target);
    if (hit) setOpenUserId(target);
    autoOpenConsumed.current = true;
  }, [autoOpenCounterpartyId, counterparties, q.data]);
  // totalBaseNet < 0 → user owes them → "Debts" section
  // totalBaseNet > 0 → they owe user → "Collectables" section
  const debts = counterparties.filter((c) => c.totalBaseNet < 0);
  const collectables = counterparties.filter((c) => c.totalBaseNet > 0);

  const open =
    openUserId !== null
      ? (counterparties.find((c) => c.userId === openUserId) ?? null)
      : null;

  const renderRow = (c: (typeof counterparties)[number]) => {
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
    const subhead =
      c.totalBaseNet < 0 ? `You owe ${fullName}` : `${fullName} owes you`;
    // Net total only — bucket breakdown lives in the drill-in sheet.
    // Mixed-direction buckets within one counterparty would be misleading
    // here (e.g. user is net-owed by X but owes X in one specific chat).
    return (
      <Cell
        key={c.userId}
        before={<ChatMemberAvatar userId={c.userId} size={40} />}
        subhead={subhead}
        after={<Navigation></Navigation>}
        onClick={() => {
          hapticFeedback.impactOccurred.ifAvailable("light");
          setOpenUserId(c.userId);
        }}
      >
        <Text className={cn(getBalanceColorClass(c.totalBaseNet))}>
          {formatCurrencyWithCode(
            Math.abs(c.totalBaseNet),
            initialBaseCurrency
          )}
        </Text>
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
              🚨 Debts
            </Title>
          }
        >
          {q.isLoading ? skeletonRows : []}
          {!q.isLoading && !q.isError ? debts.map(renderRow) : []}
          {!q.isLoading && !q.isError && debts.length === 0 ? (
            <div className="flex h-16 items-center justify-center">
              <Caption className="text-center text-gray-500" weight="1">
                🔥 You are all settled
              </Caption>
            </div>
          ) : (
            []
          )}
        </Section>

        <Section
          header={
            <Title weight="2" className="px-1 py-2" level="3">
              🤑 Collectables
            </Title>
          }
        >
          {q.isLoading ? skeletonRows : []}
          {!q.isLoading && !q.isError ? collectables.map(renderRow) : []}
          {!q.isLoading && !q.isError && collectables.length === 0 ? (
            <div className="flex h-16 items-center justify-center">
              <Caption className="text-center text-gray-500" weight="1">
                💁 No one owes you
              </Caption>
            </div>
          ) : (
            []
          )}
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
        baseCurrency={q.data?.baseCurrency ?? initialBaseCurrency}
        currencyMap={currencyMap}
        onOpenChange={(o) => !o && setOpenUserId(null)}
        onAfterMutate={() => q.refetch()}
      />
    </section>
  );
}
