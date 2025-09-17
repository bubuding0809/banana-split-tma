import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { formatCurrencyWithCode } from "@/utils/financial";
import { RouterOutputs } from "@dko/trpc";
import {
  Caption,
  Cell,
  Info,
  Modal,
  Navigation,
  Section,
  Skeleton,
  Text,
} from "@telegram-apps/telegram-ui";
import ToPayModal from "./ToPayModal";
import ToReceiveModal from "./ToReceiveModal";
import { useState, useMemo, useEffect, useCallback } from "react";
import { trpc } from "@/utils/trpc";
import {
  mainButton,
  themeParams,
  useSignal,
  hapticFeedback,
  initData,
  popup,
} from "@telegram-apps/sdk-react";
import { cn } from "@/utils/cn";
import { getBalanceColorClass } from "@/utils/financial";
import { useStartParams } from "@/hooks";

interface MultiCurrencyBalanceModalProps {
  modalOpen: boolean;
  onOpenChange: (open: boolean) => void;
  member: NonNullable<RouterOutputs["chat"]["getChat"]>["members"][0] & {
    balances: {
      currency: string;
      amount: number;
    }[];
  };
  balanceType: "debtor" | "creditor";
  baseCurrency: string;
  currencyMap: Map<string, { code: string; name: string; flagEmoji: string }>;
}

interface BalanceEntryCellProps {
  entry: string | null;
  onEntryOpen: (entry: string | null) => void;
  balance: { currency: string; amount: number };
  currencyInfo: { code: string; name: string; flagEmoji: string } | undefined;
  BalanceModal: typeof ToPayModal | typeof ToReceiveModal;
  member: MultiCurrencyBalanceModalProps["member"];
  baseCurrency: string;
  multipleRatesData?: {
    rates: Record<
      string,
      {
        rate: number;
        lastUpdated: Date;
        calculationMethod: "direct" | "cross" | "refreshed";
      }
    >;
  };
  multipleRatesStatus: "error" | "success" | "pending";
}

const BalanceEntryCell = ({
  entry,
  onEntryOpen,
  balance,
  currencyInfo,
  BalanceModal,
  member,
  baseCurrency,
  multipleRatesData,
  multipleRatesStatus,
}: BalanceEntryCellProps) => {
  const absAmount = Math.abs(balance.amount);
  const tSubtitleColor = useSignal(themeParams.subtitleTextColor);

  // Calculate converted amount if currency differs from base
  const convertedAmount = useMemo(() => {
    if (balance.currency === baseCurrency) return null;

    const rateInfo = multipleRatesData?.rates[balance.currency];
    if (!rateInfo) return null;

    return balance.amount / rateInfo.rate;
  }, [balance.currency, balance.amount, baseCurrency, multipleRatesData]);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      onEntryOpen(balance.currency);
    } else {
      onEntryOpen(null);
    }
  };

  return (
    <Cell
      Component="label"
      before={
        <span className="text-2xl">{currencyInfo?.flagEmoji ?? "🌍"}</span>
      }
      onClick={() => handleOpenChange(true)}
      after={
        <>
          <Navigation></Navigation>
          <BalanceModal
            modalOpen={entry === balance.currency}
            onOpenChange={handleOpenChange}
            currency={balance.currency}
            member={{
              ...member,
              balance: balance.amount,
            }}
            nested={true}
            convertedBalance={convertedAmount ?? 0}
          />
        </>
      }
      subhead={currencyInfo?.name ?? balance.currency}
    >
      <div className="flex gap-x-1">
        <Text className={cn(getBalanceColorClass(balance.amount))}>
          {formatCurrencyWithCode(absAmount, balance.currency)}
        </Text>
        {balance.currency !== baseCurrency && (
          <Skeleton visible={multipleRatesStatus === "pending"}>
            <Caption style={{ color: tSubtitleColor }}>
              or{" "}
              {convertedAmount !== null &&
                formatCurrencyWithCode(Math.abs(convertedAmount), baseCurrency)}
            </Caption>
          </Skeleton>
        )}
      </div>
    </Cell>
  );
};

const MultiCurrencyBalanceModal = ({
  onOpenChange,
  modalOpen,
  member,
  balanceType,
  baseCurrency,
  currencyMap,
}: MultiCurrencyBalanceModalProps) => {
  const [openedEntry, setOpenedEntry] = useState<string | null>(null);
  const trpcUtils = trpc.useUtils();
  const tUserData = useSignal(initData.user);
  const startParams = useStartParams();

  const userId = tUserData?.id ?? 0;
  const chatId = startParams?.chat_id ?? 0;

  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });

  const isDebtor = balanceType === "debtor";
  const title = isDebtor ? "Send Reminders?" : `Settle Debts?`;
  const body = isDebtor
    ? "You"
    : `${member.firstName} ${member.lastName ?? ""}`;
  const subhead = isDebtor ? `${member.firstName} owes` : `You owe`;
  const BalanceModal = isDebtor ? ToReceiveModal : ToPayModal;

  // Extract unique currencies that differ from base currency for conversion
  const uniqueForeignCurrencies = useMemo(() => {
    if (!member.balances || !baseCurrency) return [];
    const currencies = new Set(
      member.balances.map((balance) => balance.currency)
    );
    // Only currencies that differ from base currency need conversion
    return Array.from(currencies).filter(
      (currency) => currency !== baseCurrency
    );
  }, [member.balances, baseCurrency]);

  // Query conversion rates for all foreign currencies using bulk endpoint
  const { data: multipleRatesData, status: multipleRatesStatus } =
    trpc.currency.getMultipleRates.useQuery(
      {
        baseCurrency: baseCurrency ?? "SGD",
        targetCurrencies: uniqueForeignCurrencies,
      },
      {
        enabled:
          modalOpen && !!baseCurrency && uniqueForeignCurrencies.length > 0,
      }
    );

  // Calculate total balance converted to base currency
  const convertedTotal = useMemo(() => {
    if (!member.balances || !baseCurrency) return 0;

    // Check if conversion rates are loaded (for foreign currencies)
    if (
      uniqueForeignCurrencies.length > 0 &&
      multipleRatesStatus !== "success"
    ) {
      return null; // Return null to indicate loading state
    }

    // Use the rates from the bulk query
    const rateMap = multipleRatesData?.rates || {};

    return member.balances.reduce((acc, balance) => {
      const amount = balance.amount;
      const currency = balance.currency;

      // Convert to base currency if needed
      if (currency === baseCurrency) {
        return acc + amount;
      } else {
        const rateInfo = rateMap[currency];
        if (!rateInfo) return acc; // Skip if rate not available
        return acc + amount / rateInfo.rate; // Convert to base currency
      }
    }, 0);
  }, [
    member.balances,
    baseCurrency,
    uniqueForeignCurrencies.length,
    multipleRatesStatus,
    multipleRatesData?.rates,
  ]);

  // Settlement mutation
  const settleAllDebtsMutation = trpc.settlement.settleAllDebts.useMutation({
    onSuccess: () => {
      trpcUtils.chat.getDebtorsMultiCurrency.invalidate({
        chatId,
        userId,
      });
      trpcUtils.chat.getCreditorsMultiCurrency.invalidate({
        chatId,
        userId,
      });
      trpcUtils.chat.getSimplifiedDebtsMultiCurrency.invalidate({
        chatId,
      });
      trpcUtils.currency.getCurrentRate.invalidate();
      trpcUtils.currency.getMultipleRates.invalidate();
      hapticFeedback.notificationOccurred.ifAvailable("success");
      onOpenChange(false);
    },
    onError: (error) => {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      popup.open.ifAvailable({
        message: `Failed to settle debts: ${error.message}`,
      });
    },
  });

  const handleSettleAllDebts = useCallback(async () => {
    if (!tUserData?.firstName) {
      popup.open.ifAvailable({
        message: "Unable to settle debts. User data not available.",
      });
      return;
    }

    mainButton.setParams.ifAvailable({
      isLoaderVisible: true,
      isEnabled: false,
    });

    try {
      await settleAllDebtsMutation.mutateAsync({
        chatId,
        senderId: isDebtor ? member.id : userId,
        receiverId: isDebtor ? userId : member.id,
        balances: member.balances,
        sendNotification: true,
        creditorName: isDebtor ? tUserData.firstName : member.firstName,
        creditorUsername: isDebtor
          ? tUserData.username || undefined
          : member.username || undefined,
        debtorName: isDebtor ? member.firstName : tUserData.firstName,
        threadId: dChatData?.threadId,
      });
    } catch (error) {
      console.error("Error settling all debts:", error);
    } finally {
      mainButton.setParams.ifAvailable({
        isLoaderVisible: false,
        isEnabled: true,
      });
    }
  }, [
    tUserData?.firstName,
    tUserData?.username,
    settleAllDebtsMutation,
    chatId,
    isDebtor,
    member.id,
    member.firstName,
    member.username,
    member.balances,
    userId,
    dChatData?.threadId,
  ]);

  useEffect(() => {
    if (openedEntry === null && modalOpen) {
      mainButton.setParams.ifAvailable({
        isVisible: true,
        isEnabled: true,
        text: "Settle All ✅",
      });
    }

    return () => {
      mainButton.setParams.ifAvailable({ isVisible: false });
    };
  }, [modalOpen, openedEntry]);

  useEffect(() => {
    let offMainButtonClick: VoidFunction | undefined;

    if (openedEntry === null && modalOpen) {
      offMainButtonClick = mainButton.onClick.ifAvailable(handleSettleAllDebts);
    }

    return () => offMainButtonClick?.();
  }, [handleSettleAllDebts, modalOpen, openedEntry]);

  return (
    <Modal
      header={<Modal.Header>{title}</Modal.Header>}
      open={modalOpen}
      onOpenChange={onOpenChange}
    >
      <div className="flex max-h-[70vh] min-h-40 flex-col gap-y-2 pb-8 pt-px">
        <Section className="pe-2">
          <Cell
            before={<ChatMemberAvatar userId={member.id} size={48} />}
            subhead={subhead}
            after={
              <Info type="text" subtitle="Total">
                <Skeleton visible={convertedTotal === null}>
                  {convertedTotal !== null
                    ? formatCurrencyWithCode(
                        Math.abs(convertedTotal),
                        baseCurrency
                      )
                    : "Loading..."}
                </Skeleton>
              </Info>
            }
          >
            {body}
          </Cell>
        </Section>
        <Section header={"Breakdown"}>
          {member.balances.map((balance) => (
            <BalanceEntryCell
              entry={openedEntry}
              onEntryOpen={setOpenedEntry}
              key={balance.currency}
              balance={balance}
              currencyInfo={currencyMap.get(balance.currency)}
              BalanceModal={BalanceModal}
              member={member}
              baseCurrency={baseCurrency}
              multipleRatesData={multipleRatesData}
              multipleRatesStatus={multipleRatesStatus}
            />
          ))}
        </Section>
      </div>
    </Modal>
  );
};

export default MultiCurrencyBalanceModal;
