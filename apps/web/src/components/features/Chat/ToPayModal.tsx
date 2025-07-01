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

const ToPayModal = ({ onOpenChange, modalOpen, member }: ToPayModalProps) => {
  const tUserData = useSignal(initData.user);
  const startParams = useStartParams();

  const userId = tUserData?.id ?? 0;
  const chatId = startParams?.chat_id ?? 0;

  const createSettlementMutation =
    trpc.settlement.createSettlement.useMutation();

  const absAmountOwed = Math.abs(member.balance);

  const handleCreateSettlement = useCallback(async () => {
    try {
      mainButton.setParams.ifAvailable({
        isLoaderVisible: true,
      });
      await createSettlementMutation.mutateAsync({
        amount: absAmountOwed,
        receiverId: member.id,
        senderId: userId,
        chatId,
      });
    } catch (error) {
      console.error("Error creating settlement:", error);
      popup.open.ifAvailable({
        message: "Failed to create settlement. Please try again later.",
        buttons: [
          {
            type: "close",
          },
        ],
      });
      return;
    } finally {
      mainButton.setParams.ifAvailable({
        isLoaderVisible: false,
      });
    }
    onOpenChange(false);
  }, [
    absAmountOwed,
    chatId,
    createSettlementMutation,
    member.id,
    onOpenChange,
    userId,
  ]);

  useEffect(() => {
    let offMainButtonClick: ReturnType<typeof mainButton.onClick> | undefined;

    if (modalOpen) {
      mainButton.setParams.ifAvailable({
        text: "Yup, I settled! 🤝",
        isEnabled: true,
        isVisible: true,
      });

      offMainButtonClick = mainButton.onClick(handleCreateSettlement);
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
  }, [
    absAmountOwed,
    chatId,
    createSettlementMutation,
    handleCreateSettlement,
    member.id,
    modalOpen,
    onOpenChange,
    userId,
  ]);

  return (
    <Modal
      header={<ModalHeader />}
      open={modalOpen}
      onOpenChange={onOpenChange}
    >
      <Placeholder
        description="Already settled your debt?"
        header={
          <>
            You owe {member.firstName}{" "}
            <span className="text-red-500">
              {sgdFormatter.format(absAmountOwed)}
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

export default ToPayModal;
