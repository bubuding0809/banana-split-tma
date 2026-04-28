import { useStartParams } from "@/hooks";
import { formatCurrencyWithCode } from "@/utils/financial";
import { trpc } from "@/utils/trpc";
import { RouterOutputs } from "@dko/trpc";
import {
  hapticFeedback,
  initData,
  mainButton,
  popup,
  secondaryButton,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Badge,
  Modal,
  Placeholder,
  Skeleton,
  Text,
} from "@telegram-apps/telegram-ui";
import { useCallback, useEffect } from "react";
import { assetUrls } from "@/assets/urls";

interface ToReceiveModalProps {
  modalOpen: boolean;
  onOpenChange: (open: boolean) => void;
  member: NonNullable<RouterOutputs["chat"]["getChat"]>["members"][0] & {
    balance: number;
  };
  convertedBalance?: number;
  currency: string;
  nested?: boolean;
}

const ToReceiveModal = ({
  onOpenChange,
  modalOpen,
  member,
  convertedBalance,
  currency,
  nested = false,
}: ToReceiveModalProps) => {
  const trpcUtils = trpc.useUtils();
  const tUserData = useSignal(initData.user);
  const startParams = useStartParams();

  const userId = tUserData?.id ?? 0;
  const chatId = startParams?.chat_id ?? 0;

  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });
  const { data: conversionRateData, status: conversionRateStatus } =
    trpc.currency.getCurrentRate.useQuery(
      {
        baseCurrency: dChatData?.baseCurrency ?? "SGD",
        targetCurrency: currency ?? "SGD",
      },
      {
        enabled: !!dChatData?.baseCurrency && !!currency,
      }
    );

  const absAmountLent = Math.abs(member.balance);

  const sendDebtReminderMutation =
    trpc.telegram.sendDebtReminderMessage.useMutation();

  const createSettlementMutation = trpc.settlement.createSettlement.useMutation(
    {
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
      },
    }
  );

  const handleSendReminder = useCallback(async () => {
    hapticFeedback.impactOccurred.ifAvailable("light");
    if (!tUserData?.firstName) {
      popup.open.ifAvailable({
        message: "Unable to send reminder. User data not available.",
      });
      return;
    }

    try {
      secondaryButton.setParams.ifAvailable({
        isLoaderVisible: true,
        isEnabled: false,
      });
      await sendDebtReminderMutation.mutateAsync({
        chatId,
        debtorUserId: Number(member.id),
        debtorName: member.firstName,
        debtorUsername: member.username || undefined,
        creditorName: tUserData.firstName,
        amount: absAmountLent,
        currency: currency,
        threadId: dChatData?.threadId ? Number(dChatData.threadId) : undefined,
      });

      hapticFeedback.notificationOccurred.ifAvailable("success");
      onOpenChange(false);
    } catch (error) {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      console.error("Error sending reminder:", error);
      popup.open.ifAvailable({
        message: "Failed to send reminder. Please try again later.",
      });
    } finally {
      secondaryButton.setParams.ifAvailable({
        isLoaderVisible: false,
        isEnabled: true,
      });
    }
  }, [
    tUserData?.firstName,
    sendDebtReminderMutation,
    chatId,
    member.id,
    member.firstName,
    member.username,
    absAmountLent,
    currency,
    dChatData?.threadId,
    onOpenChange,
  ]);

  const handleSettleDebt = useCallback(async () => {
    if (!tUserData?.firstName) {
      popup.open.ifAvailable({
        message: "Unable to settle debt. User data not available.",
      });
      return;
    }

    mainButton.setParams.ifAvailable({
      isLoaderVisible: true,
      isEnabled: false,
    });
    secondaryButton.setParams.ifAvailable({
      isEnabled: false,
    });
    try {
      // Create the settlement with notification (creditor settles on behalf of debtor)
      await createSettlementMutation.mutateAsync({
        amount: absAmountLent,
        senderId: member.id, // debtor is the sender
        receiverId: userId, // creditor is the receiver
        chatId,
        currency,
        sendNotification: true,
        creditorName: tUserData.firstName,
        creditorUsername: tUserData.username || undefined,
        debtorName: member.firstName,
        threadId: dChatData?.threadId,
      });

      hapticFeedback.notificationOccurred.ifAvailable("success");
      onOpenChange(false);
    } catch (error) {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      console.error("Error settling debt:", error);
      popup.open.ifAvailable({
        message: "Failed to settle debt. Please try again later.",
      });
    } finally {
      mainButton.setParams.ifAvailable({
        isLoaderVisible: false,
        isEnabled: true,
      });
      secondaryButton.setParams.ifAvailable({
        isEnabled: true,
      });
    }
  }, [
    tUserData?.firstName,
    tUserData?.username,
    createSettlementMutation,
    absAmountLent,
    member.id,
    member.firstName,
    userId,
    chatId,
    currency,
    onOpenChange,
    dChatData?.threadId,
  ]);

  // Set secondary button parameters when modal opens
  useEffect(() => {
    if (!modalOpen) return;

    secondaryButton.setParams.ifAvailable({
      text: "Remind 💬",
      isEnabled: true,
      isVisible: true,
    });

    return () => {
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
    };
  }, [modalOpen]);

  // Set up main button when modal opens
  useEffect(() => {
    if (!modalOpen) return;

    mainButton.setParams.ifAvailable({
      isVisible: true,
      isEnabled: true,
      text: "Settled ✅",
    });

    return () => {
      mainButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;

    const offMainButtonClick = mainButton.onClick.ifAvailable(handleSettleDebt);

    return () => {
      offMainButtonClick?.();
    };
  }, [handleSettleDebt, modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;

    const offSecondaryButtonClick =
      secondaryButton.onClick.ifAvailable(handleSendReminder);

    return () => {
      offSecondaryButtonClick?.();
    };
  }, [handleSendReminder, modalOpen]);

  return (
    <Modal
      header={<Modal.Header></Modal.Header>}
      open={modalOpen}
      nested={nested}
      onOpenChange={onOpenChange}
    >
      <div>
        <Placeholder
          description={
            currency !== dChatData?.baseCurrency ? (
              <div className="flex flex-col items-center gap-2">
                <Text>
                  or $
                  {formatCurrencyWithCode(
                    convertedBalance,
                    dChatData?.baseCurrency
                  )}
                </Text>
                <Skeleton visible={conversionRateStatus === "pending"}>
                  <Badge type="number">
                    1 {dChatData?.baseCurrency} ≈{" "}
                    {conversionRateData?.rate.toFixed(2)} {currency}
                  </Badge>
                </Skeleton>
              </div>
            ) : null
          }
          header={
            <>
              {member.firstName} owes you{" "}
              <span className="text-green-500">
                {formatCurrencyWithCode(absAmountLent, currency)}
              </span>
            </>
          }
        >
          <img
            alt="Telegram sticker"
            src={assetUrls.bananaLoudSpeaker}
            style={{
              display: "block",
              height: "88px",
              width: "88px",
            }}
          />
        </Placeholder>
      </div>
    </Modal>
  );
};

export default ToReceiveModal;
