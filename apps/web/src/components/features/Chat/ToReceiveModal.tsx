import { useStartParams } from "@/hooks";
import { formatCurrencyWithCode } from "@/utils/financial";
import { trpc } from "@/utils/trpc";
import { RouterOutputs } from "@dko/trpc";
import {
  hapticFeedback,
  initData,
  mainButton,
  popup,
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
  const tUserData = useSignal(initData.user);
  const startParams = useStartParams();
  const { selectedCurrency } = useSearch({
    from: "/_tma/chat/$chatId",
  });

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

  // Set main button parameters when modal opens
  useEffect(() => {
    if (!modalOpen) return;

    mainButton.setParams.ifAvailable({
      text: "Send a reminder! 💬",
      isEnabled: true,
      isVisible: true,
    });

    return () => {
      mainButton.setParams.ifAvailable({
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

    return () => {
      offMainButtonClick?.();
    };
  }, [handleSendReminder, modalOpen]);

  return (
    <Modal
      header={<Modal.Header>Send reminder?</Modal.Header>}
      open={modalOpen}
      onOpenChange={onOpenChange}
    >
      <div>
        <Placeholder
          description={
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
