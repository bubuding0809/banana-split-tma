import { useMemo, useState } from "react";
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
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
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
}

export default function UserBalancesTab({ initialBaseCurrency }: Props) {
  const [openUserId, setOpenUserId] = useState<number | null>(null);
  const tSubtitleColor = useSignal(themeParams.subtitleTextColor);

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
        <div className="flex flex-col">
          {c.groups.map((g) => (
            <div
              key={`${g.chatId}-${g.currency}`}
              className="relative flex gap-x-1"
            >
              <span className="z-10 size-6">
                {currencyMap.get(g.currency)?.flagEmoji ?? "🌍"}
              </span>
              <div className="flex gap-x-1">
                <Text className={cn(getBalanceColorClass(g.nativeNet))}>
                  {formatCurrencyWithCode(Math.abs(g.nativeNet), g.currency)}
                </Text>
                {g.currency !== initialBaseCurrency && (
                  <Caption style={{ color: tSubtitleColor }}>
                    or{" "}
                    {formatCurrencyWithCode(
                      Math.abs(g.baseNet),
                      initialBaseCurrency
                    )}
                  </Caption>
                )}
              </div>
            </div>
          ))}
        </div>
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
