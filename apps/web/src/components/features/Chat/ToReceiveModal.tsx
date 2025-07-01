import ModalHeader from "@/components/ui/ModalHeader";
import { sgdFormatter } from "@/utils/financial";
import { RouterOutputs } from "@dko/trpc";
import { mainButton } from "@telegram-apps/sdk-react";
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

  const absAmountLent = Math.abs(member.balance);

  const handleSendReminder = useCallback(async () => {
    alert(
      `Reminder sent to ${member.firstName} for the amount of ${sgdFormatter.format(absAmountLent)}.`
    );
  }, [absAmountLent, member.firstName]);

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
