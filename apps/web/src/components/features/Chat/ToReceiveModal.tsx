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
import { Modal, Placeholder } from "@telegram-apps/telegram-ui";
import { useCallback, useEffect } from "react";
import { assetUrls } from "@/assets/urls";
import { useSearch } from "@tanstack/react-router";

interface ToPayModalProps {
  modalOpen: boolean;
  onOpenChange: (open: boolean) => void;
  member: NonNullable<RouterOutputs["chat"]["getChat"]>["members"][0] & {
    balance: number;
  };
}

const ToRecieveModal = ({
  onOpenChange,
  modalOpen,
  member,
}: ToPayModalProps) => {
  const tUserData = useSignal(initData.user);
  const startParams = useStartParams();
  const { selectedCurrency } = useSearch({
    from: "/_tma/chat/$chatId",
  });

  const chatId = startParams?.chat_id ?? 0;
  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });

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
      text: "Not yet, send a reminder! 💬",
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
          description="Received your payment?"
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

export default ToRecieveModal;
