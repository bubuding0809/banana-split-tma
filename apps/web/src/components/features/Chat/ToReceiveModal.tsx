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
import { useSearch } from "@tanstack/react-router";

interface ToReceiveModalProps {
  modalOpen: boolean;
  onOpenChange: (open: boolean) => void;
  member: NonNullable<RouterOutputs["chat"]["getChat"]>["members"][0] & {
    balance: number;
  };
  convertedBalance?: number;
}

const ToReceiveModal = ({
  onOpenChange,
  modalOpen,
  member,
  convertedBalance,
}: ToReceiveModalProps) => {
  const trpcUtils = trpc.useUtils();
  const tUserData = useSignal(initData.user);
  const startParams = useStartParams();
  const { selectedCurrency } = useSearch({
    from: "/_tma/chat/$chatId",
  });

  const userId = tUserData?.id ?? 0;
  const chatId = startParams?.chat_id ?? 0;

  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });
  const { data: conversionRateData, status: conversionRateStatus } =
    trpc.currency.getCurrentRate.useQuery(
      {
        baseCurrency: dChatData?.baseCurrency ?? "SGD",
        targetCurrency: selectedCurrency ?? "SGD",
      },
      {
        enabled: !!dChatData?.baseCurrency && !!selectedCurrency,
      }
    );

  const absAmountLent = Math.abs(member.balance);

  const sendDebtReminderMutation =
    trpc.telegram.sendDebtReminderMessage.useMutation();

  const createSettlementMutation = trpc.settlement.createSettlement.useMutation(
    {
      onSuccess: () => {
        trpcUtils.chat.getDebtors.invalidate({
          chatId,
          userId,
        });
        trpcUtils.chat.getCreditors.invalidate({
          chatId,
          userId,
        });
      },
    }
  );

  const handleSendReminder = useCallback(async () => {
    if (!tUserData?.firstName) {
      popup.open({
        message: "Unable to send reminder. User data not available.",
      });
      return;
    }

    try {
      mainButton.setParams.ifAvailable({
        isLoaderVisible: true,
      });
      await sendDebtReminderMutation.mutateAsync({
        chatId,
        debtorUserId: Number(member.id),
        debtorName: member.firstName,
        debtorUsername: member.username || undefined,
        creditorName: tUserData.firstName,
        amount: absAmountLent,
        currency: selectedCurrency,
        threadId: dChatData?.threadId ? Number(dChatData.threadId) : undefined,
      });

      hapticFeedback.notificationOccurred.ifAvailable("success");
      onOpenChange(false);
    } catch (error) {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      console.error("Error sending reminder:", error);
      popup.open({
        message: "Failed to send reminder. Please try again later.",
      });
    } finally {
      mainButton.setParams({
        isLoaderVisible: false,
      });
    }
  }, [
    absAmountLent,
    chatId,
    dChatData?.threadId,
    member.firstName,
    member.id,
    member.username,
    onOpenChange,
    selectedCurrency,
    sendDebtReminderMutation,
    tUserData?.firstName,
  ]);

  const handleSettleDebt = useCallback(async () => {
    if (!tUserData?.firstName) {
      popup.open({
        message: "Unable to settle debt. User data not available.",
      });
      return;
    }

    try {
      secondaryButton.setParams.ifAvailable({
        isLoaderVisible: true,
        isEnabled: false,
      });

      // Create the settlement with notification (creditor settles on behalf of debtor)
      await createSettlementMutation.mutateAsync({
        amount: absAmountLent,
        senderId: member.id, // debtor is the sender
        receiverId: userId, // creditor is the receiver
        chatId,
        currency: selectedCurrency,
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
      popup.open({
        message: "Failed to settle debt. Please try again later.",
      });
    } finally {
      secondaryButton.setParams.ifAvailable({
        isLoaderVisible: false,
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
    selectedCurrency,
    onOpenChange,
    dChatData?.threadId,
  ]);

  // Set button parameters when modal opens
  useEffect(() => {
    if (!modalOpen) return;

    mainButton.setParams.ifAvailable({
      text: "Remind 💬",
      isEnabled: true,
      isVisible: true,
    });

    secondaryButton.setParams.ifAvailable({
      text: "Settled ✅",
      isEnabled: true,
      isVisible: true,
    });

    return () => {
      mainButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
    };
  }, [modalOpen]);

  // Attach button handlers
  useEffect(() => {
    if (!modalOpen) return;

    const offMainButtonClick =
      mainButton.onClick.ifAvailable(handleSendReminder);
    const offSecondaryButtonClick =
      secondaryButton.onClick.ifAvailable(handleSettleDebt);

    return () => {
      offMainButtonClick?.();
      offSecondaryButtonClick?.();
    };
  }, [handleSendReminder, handleSettleDebt, modalOpen]);

  return (
    <Modal
      header={<Modal.Header>Send reminder?</Modal.Header>}
      open={modalOpen}
      onOpenChange={onOpenChange}
    >
      <div>
        <Placeholder
          description={
            selectedCurrency !== dChatData?.baseCurrency ? (
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
                    {conversionRateData?.rate.toFixed(2)} {selectedCurrency}
                  </Badge>
                </Skeleton>
              </div>
            ) : null
          }
          header={
            <>
              {member.firstName} owes you{" "}
              <span className="text-green-500">
                {formatCurrencyWithCode(absAmountLent, selectedCurrency)}
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
