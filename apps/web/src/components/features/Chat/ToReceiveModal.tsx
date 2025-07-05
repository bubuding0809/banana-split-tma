import ModalHeader from "@/components/ui/ModalHeader";
import { useStartParams } from "@/hooks";
import { sgdFormatter } from "@/utils/financial";
import { trpc } from "@/utils/trpc";
import { RouterOutputs } from "@dko/trpc";
import {
  initData,
  mainButton,
  popup,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Modal, Placeholder } from "@telegram-apps/telegram-ui";
import { useCallback, useEffect } from "react";
import { assetUrls } from "@/assets/urls";

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
  const tSecondaryBgColor = useSignal(themeParams.secondaryBackgroundColor);

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
        currency: "SGD",
        threadId: dChatData?.threadId ? Number(dChatData.threadId) : undefined,
      });
      popup.open({
        message: "Reminder sent successfully! 📩",
      });
    } catch (error) {
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
    dChatData?.threadId,
    chatId,
    member.firstName,
    member.id,
    member.username,
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
      header={
        <ModalHeader
          style={{
            backgroundColor: tSecondaryBgColor,
          }}
        />
      }
      open={modalOpen}
      onOpenChange={onOpenChange}
    >
      <div
        style={{
          backgroundColor: tSecondaryBgColor,
        }}
      >
        <Placeholder
          description="Received your payment?"
          header={
            <>
              {member.firstName} owes you{" "}
              <span className="text-green-500">
                {sgdFormatter.format(absAmountLent)}
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
