import { useState } from "react";
import { Cell, Section, Spinner } from "@telegram-apps/telegram-ui";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { trpc } from "@/utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import CurrencySelectionModal from "@/components/ui/CurrencySelectionModal";
import { CounterpartyBalanceSheet } from "./CounterpartyBalanceSheet";
import {
  getCurrencyDecimalDigits,
  getCurrencySymbol,
} from "@dko/trpc/src/utils/currencyApi";

function fmt(n: number, ccy: string): string {
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n).toFixed(getCurrencyDecimalDigits(ccy));
  return `${sign} ${getCurrencySymbol(ccy)}${abs}`;
}

interface Props {
  initialBaseCurrency: string;
  userId: number;
}

export default function UserBalancesTab({
  initialBaseCurrency,
  userId,
}: Props) {
  const [base, setBase] = useState(initialBaseCurrency);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openUserId, setOpenUserId] = useState<number | null>(null);

  const q = trpc.expenseShare.getMyCounterpartyBalances.useQuery({
    baseCurrency: base,
  });

  if (q.isLoading) return <Spinner size="m" />;
  if (q.isError)
    return (
      <Section>
        <Cell>Failed to load balances. Pull to refresh.</Cell>
      </Section>
    );

  const data = q.data!;
  const totalOwed = data.counterparties
    .filter((c) => c.totalBaseNet > 0)
    .reduce((acc, c) => acc + c.totalBaseNet, 0);
  const totalOwes = data.counterparties
    .filter((c) => c.totalBaseNet < 0)
    .reduce((acc, c) => acc + Math.abs(c.totalBaseNet), 0);

  const open =
    openUserId !== null
      ? (data.counterparties.find((c) => c.userId === openUserId) ?? null)
      : null;

  return (
    <>
      <Section
        header={`Net across all groups · ${base}`}
        footer={
          <span
            className="cursor-pointer underline"
            onClick={() => {
              hapticFeedback.selectionChanged.ifAvailable();
              setPickerOpen(true);
            }}
          >
            Change base currency
          </span>
        }
      >
        <Cell after={fmt(totalOwed, base)}>Owed to you</Cell>
        <Cell after={fmt(-totalOwes, base)}>You owe</Cell>
      </Section>

      <Section header="People">
        {data.counterparties.length === 0 ? (
          <Cell>No outstanding balances across any group.</Cell>
        ) : (
          data.counterparties.map((c) => {
            const fullName = [c.firstName, c.lastName]
              .filter(Boolean)
              .join(" ");
            const groupsText =
              c.groups.length === 1
                ? c.groups[0].chatTitle
                : `${c.groups.length} groups`;
            return (
              <Cell
                key={c.userId}
                before={<ChatMemberAvatar userId={c.userId} size={40} />}
                subtitle={groupsText}
                after={fmt(c.totalBaseNet, base)}
                onClick={() => {
                  hapticFeedback.impactOccurred.ifAvailable("light");
                  setOpenUserId(c.userId);
                }}
              >
                {fullName}
              </Cell>
            );
          })
        )}
      </Section>

      <CurrencySelectionModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedCurrency={base}
        userId={userId}
        onCurrencySelect={(code) => setBase(code)}
        footerMessage="Session override — your saved base currency in Settings is unchanged."
      />

      <CounterpartyBalanceSheet
        open={open !== null}
        counterparty={open}
        baseCurrency={data.baseCurrency}
        ratesAsOf={data.ratesAsOf}
        onOpenChange={(o) => !o && setOpenUserId(null)}
        onAfterMutate={() => q.refetch()}
      />
    </>
  );
}
