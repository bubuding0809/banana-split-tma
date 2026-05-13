import { useCallback, useEffect } from "react";
import {
  Caption,
  Cell,
  Info,
  Modal,
  Section,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  mainButton,
  popup,
  secondaryButton,
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
import PayNowQR from "./PayNowQR";

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
  currencyMap: Map<string, { code: string; name: string; flagEmoji: string }>;
  onOpenChange: (open: boolean) => void;
  onAfterMutate: () => void;
}

export function CounterpartyBalanceSheet({
  open,
  counterparty,
  baseCurrency,
  currencyMap,
  onOpenChange,
  onAfterMutate,
}: Props) {
  const tSubtitleColor = useSignal(themeParams.subtitleTextColor);

  const settle = trpc.expenseShare.settleAllWithUser.useMutation({
    onSuccess: () => {
      hapticFeedback.notificationOccurred.ifAvailable("success");
      onAfterMutate();
      onOpenChange(false);
    },
    onError: (e) => {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      popup.open.ifAvailable({
        message: `Failed to settle debts: ${e.message}`,
      });
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

  const isOwedToUser = (counterparty?.totalBaseNet ?? 0) > 0;
  const isDebtor = !!counterparty && !isOwedToUser; // caller owes counterparty
  const canNudge = !!counterparty && isOwedToUser && counterparty.hasStartedBot;

  // Phone lookup for PayNow QR + Copy Phone No. (only used in debtor direction)
  const { data: counterpartyUser } = trpc.user.getUser.useQuery(
    { userId: counterparty?.userId ?? 0 },
    { enabled: open && isDebtor }
  );
  const counterpartyPhone = counterpartyUser?.phoneNumber ?? null;

  const handleSettle = useCallback(async () => {
    if (!counterparty) return;
    mainButton.setParams.ifAvailable({
      isLoaderVisible: true,
      isEnabled: false,
    });
    try {
      await settle.mutateAsync({ counterpartyUserId: counterparty.userId });
    } finally {
      mainButton.setParams.ifAvailable({
        isLoaderVisible: false,
        isEnabled: true,
      });
    }
  }, [counterparty, settle]);

  const handleNudge = useCallback(() => {
    if (!counterparty) return;
    hapticFeedback.impactOccurred.ifAvailable("light");
    nudge.mutate({ counterpartyUserId: counterparty.userId });
  }, [counterparty, nudge]);

  const handleCopyPhone = useCallback(async () => {
    if (!counterpartyPhone) return;
    hapticFeedback.impactOccurred.ifAvailable("light");
    try {
      await navigator.clipboard.writeText(counterpartyPhone);
      hapticFeedback.notificationOccurred.ifAvailable("success");
      secondaryButton.setParams.ifAvailable({
        text: "✅ Copied",
        isEnabled: false,
      });
      setTimeout(() => {
        secondaryButton.setParams.ifAvailable({
          text: "Copy Phone No. 📲",
          isEnabled: true,
          isLoaderVisible: false,
        });
      }, 500);
    } catch (e) {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      popup.open.ifAvailable({
        message: "Failed to copy number to clipboard. Please try again.",
      });
    }
  }, [counterpartyPhone]);

  // mainButton — Settle All ✅
  useEffect(() => {
    if (!open || !counterparty) return;
    mainButton.setParams.ifAvailable({
      isVisible: true,
      isEnabled: true,
      text: "Settle All ✅",
    });
    return () => mainButton.setParams.ifAvailable({ isVisible: false });
  }, [open, counterparty]);

  useEffect(() => {
    if (!open || !counterparty) return;
    const off = mainButton.onClick.ifAvailable(handleSettle);
    return () => off?.();
  }, [open, counterparty, handleSettle]);

  // secondaryButton — direction-dependent:
  //   debtor (user owes) + counterparty has phone → "Copy Phone No. 📲"
  //   creditor (user is owed) + counterparty started bot → "Nudge 👋"
  const showCopyPhone = !!(open && isDebtor && counterpartyPhone);
  const showNudge = !!(open && canNudge);

  useEffect(() => {
    if (showCopyPhone) {
      secondaryButton.setParams.ifAvailable({
        isVisible: true,
        isEnabled: true,
        text: "Copy Phone No. 📲",
      });
    } else if (showNudge) {
      secondaryButton.setParams.ifAvailable({
        isVisible: true,
        isEnabled: true,
        text: "Nudge 👋",
      });
    }
    return () =>
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
  }, [showCopyPhone, showNudge]);

  useEffect(() => {
    if (showCopyPhone) {
      const off = secondaryButton.onClick.ifAvailable(handleCopyPhone);
      return () => off?.();
    }
    if (showNudge) {
      const off = secondaryButton.onClick.ifAvailable(handleNudge);
      return () => off?.();
    }
  }, [showCopyPhone, showNudge, handleCopyPhone, handleNudge]);

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
  const subhead = isDebtor ? "You owe" : `${counterparty.firstName} owes`;
  const body = isDebtor ? fullName : "You";
  const totalBaseAbs = Math.abs(counterparty.totalBaseNet);
  const showQr =
    isDebtor &&
    !!counterpartyPhone &&
    baseCurrency === "SGD" &&
    totalBaseAbs > 0;

  return (
    <Modal
      header={<Modal.Header>Settle Debts?</Modal.Header>}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex max-h-[70vh] min-h-40 flex-col gap-y-2 pb-8 pt-px">
        <Section className="pe-2">
          <Cell
            before={<ChatMemberAvatar userId={counterparty.userId} size={48} />}
            subhead={subhead}
            after={
              <Info type="text" subtitle="Total">
                {formatCurrencyWithCode(
                  Math.abs(counterparty.totalBaseNet),
                  baseCurrency
                )}
              </Info>
            }
          >
            {body}
          </Cell>
        </Section>

        <Section header="Breakdown">
          {counterparty.groups.map((g) => (
            <Cell
              key={`${g.chatId}-${g.currency}`}
              before={
                <span className="text-2xl">
                  {currencyMap.get(g.currency)?.flagEmoji ?? "🌍"}
                </span>
              }
              subhead={g.chatTitle}
            >
              <div className="flex gap-x-1">
                <Text className={cn(getBalanceColorClass(g.nativeNet))}>
                  {formatCurrencyWithCode(Math.abs(g.nativeNet), g.currency)}
                </Text>
                {g.currency !== baseCurrency && (
                  <Caption style={{ color: tSubtitleColor }}>
                    or{" "}
                    {formatCurrencyWithCode(Math.abs(g.baseNet), baseCurrency)}
                  </Caption>
                )}
              </div>
            </Cell>
          ))}
        </Section>

        {showQr && counterpartyPhone && (
          <div className="mt-4">
            <PayNowQR
              phoneNumber={counterpartyPhone}
              amount={totalBaseAbs}
              merchantName={counterparty.firstName}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
