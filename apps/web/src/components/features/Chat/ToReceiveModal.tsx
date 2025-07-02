import ModalHeader from "@/components/ui/ModalHeader";
import { useStartParams } from "@/hooks";
import { sgdFormatter } from "@/utils/financial";
import { trpc } from "@/utils/trpc";
import { RouterOutputs } from "@dko/trpc";
import {
  initData,
  mainButton,
  popup,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Modal, Placeholder } from "@telegram-apps/telegram-ui";
import { useCallback, useEffect } from "react";

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
  useEffect(() => {}, [modalOpen]);

  const tUserData = useSignal(initData.user);
  const startParams = useStartParams();
  const chatId = startParams?.chat_id ?? 0;

  const absAmountLent = Math.abs(member.balance);

  const sendTelegramMessageMutation = trpc.telegram.sendMessage.useMutation();

  const handleSendReminder = useCallback(async () => {
    const mention = member.username ? `@${member.username}` : member.firstName;
    const message = `💁 Hey ${mention}, you still owe ${tUserData?.firstName} ${sgdFormatter.format(absAmountLent)}. Don't forget to settle up!`;

    try {
      mainButton.setParams.ifAvailable({
        isLoaderVisible: true,
      });
      await sendTelegramMessageMutation.mutateAsync({
        chatId,
        message,
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
    chatId,
    member.firstName,
    member.username,
    sendTelegramMessageMutation,
    tUserData?.firstName,
  ]);

  useEffect(() => {
    let offMainButtonClick: ReturnType<typeof mainButton.onClick> | undefined;

    if (modalOpen) {
      mainButton.setParams.ifAvailable({
        text: "Not yet, send a reminder! 💬",
        isEnabled: true,
        isVisible: true,
      });

      offMainButtonClick = mainButton.onClick(handleSendReminder);
    } else {
      mainButton.setParams({
        isEnabled: false,
        isVisible: false,
      });
      offMainButtonClick?.();
    }

    return () => {
      mainButton.setParams({
        isVisible: false,
        isEnabled: false,
      });
      offMainButtonClick?.();
    };
  }, [handleSendReminder, modalOpen]);

  return (
    <Modal
      header={<ModalHeader />}
      open={modalOpen}
      onOpenChange={onOpenChange}
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
          src="https://xelene.me/telegram.gif"
          style={{
            display: "block",
            height: "88px",
            width: "88px",
          }}
        />
      </Placeholder>
    </Modal>
  );
};

export default ToRecieveModal;
