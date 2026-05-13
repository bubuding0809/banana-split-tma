import { Button, Cell, Modal, Section } from "@telegram-apps/telegram-ui";
import { hapticFeedback, popup } from "@telegram-apps/sdk-react";
import { trpc } from "@/utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import {
  getCurrencyDecimalDigits,
  getCurrencySymbol,
} from "@dko/trpc/src/utils/currencyApi";

interface Group {
  chatId: number;
  chatTitle: string;
  currency: string;
  nativeNet: number;
  baseNet: number;
}

interface Counterparty {
  userId: number;
  firstName: string;
  lastName: string | null;
  hasStartedBot: boolean;
  totalBaseNet: number;
  groups: Group[];
}

interface Props {
  open: boolean;
  counterparty: Counterparty | null;
  baseCurrency: string;
  ratesAsOf: Date | null;
  onOpenChange: (open: boolean) => void;
  onAfterMutate: () => void;
}

function fmt(n: number, ccy: string): string {
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n).toFixed(getCurrencyDecimalDigits(ccy));
  return `${sign}${getCurrencySymbol(ccy)}${abs}`;
}

export function CounterpartyBalanceSheet({
  open,
  counterparty,
  baseCurrency,
  ratesAsOf,
  onOpenChange,
  onAfterMutate,
}: Props) {
  const settle = trpc.expenseShare.settleAllWithUser.useMutation({
    onSuccess: () => {
      hapticFeedback.notificationOccurred.ifAvailable("success");
      onAfterMutate();
      onOpenChange(false);
    },
    onError: (e) => {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      popup.open.ifAvailable({ message: e.message ?? "Settle failed" });
    },
  });

  const nudge = trpc.expenseShare.nudgeCounterparty.useMutation({
    onSuccess: () => {
      hapticFeedback.notificationOccurred.ifAvailable("success");
      popup.open.ifAvailable({ message: "Reminder sent." });
    },
    onError: (e) => {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      popup.open.ifAvailable({ message: e.message ?? "Nudge failed" });
    },
  });

  if (!counterparty) {
    return (
      <Modal open={open} onOpenChange={onOpenChange}>
        <div />
      </Modal>
    );
  }

  const fullName = [counterparty.firstName, counterparty.lastName]
    .filter(Boolean)
    .join(" ");
  const isOwedToUser = counterparty.totalBaseNet > 0;
  const headline = isOwedToUser
    ? `${fullName} owes you ≈ ${fmt(counterparty.totalBaseNet, baseCurrency)}`
    : `You owe ${fullName} ≈ ${fmt(counterparty.totalBaseNet, baseCurrency)}`;

  const onSettleClick = async () => {
    hapticFeedback.impactOccurred.ifAvailable("medium");
    const choice = await popup.open.ifAvailable({
      title: "Mark all settled?",
      message: `This will write ${counterparty.groups.length} settlement record(s) in native currency, zeroing your balance with ${fullName} across all shared groups.`,
      buttons: [
        { id: "confirm", type: "destructive", text: "Settle all" },
        { id: "cancel", type: "cancel" },
      ],
    });
    if (choice === "confirm") {
      settle.mutate({ counterpartyUserId: counterparty.userId });
    }
  };

  const onNudgeClick = () => {
    hapticFeedback.impactOccurred.ifAvailable("light");
    nudge.mutate({ counterpartyUserId: counterparty.userId });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>{headline}</Modal.Header>}
    >
      <div className="max-h-[75vh] overflow-y-auto">
        <Section>
          <Cell
            before={<ChatMemberAvatar userId={counterparty.userId} size={40} />}
          >
            {fullName}
          </Cell>
        </Section>

        <Section header="Per-group breakdown">
          {counterparty.groups.map((g) => (
            <Cell
              key={`${g.chatId}-${g.currency}`}
              subtitle={g.chatTitle}
              after={`${fmt(g.nativeNet, g.currency)} ≈ ${fmt(g.baseNet, baseCurrency)}`}
            >
              {g.currency}
            </Cell>
          ))}
          {ratesAsOf && (
            <Cell subhead={`Rates as of ${ratesAsOf.toLocaleString()}`}> </Cell>
          )}
        </Section>

        <div className="flex gap-2 p-3">
          <Button
            stretched
            size="l"
            mode="bezeled"
            disabled={
              !counterparty.hasStartedBot || nudge.isPending || !isOwedToUser
            }
            onClick={onNudgeClick}
          >
            {nudge.isPending ? "Nudging…" : "Nudge"}
          </Button>
          <Button
            stretched
            size="l"
            mode="filled"
            disabled={settle.isPending}
            onClick={onSettleClick}
          >
            {settle.isPending ? "Settling…" : "Mark all settled"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
