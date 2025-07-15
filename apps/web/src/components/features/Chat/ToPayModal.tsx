import { useStartParams } from "@/hooks";
import { sgdFormatter } from "@/utils/financial";
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

const ToPayModal = ({ onOpenChange, modalOpen, member }: ToPayModalProps) => {
  const trpcUtils = trpc.useUtils();
  const tUserData = useSignal(initData.user);
  const startParams = useStartParams();
  const { selectedCurrency } = useSearch({
    from: "/_tma/chat/$chatId",
  });

  const userId = tUserData?.id ?? 0;
  const chatId = startParams?.chat_id ?? 0;
  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });

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

  const sendSettlementNotificationMutation =
    trpc.telegram.sendSettlementNotificationMessage.useMutation();

  const absAmountOwed = Math.abs(member.balance);

  const handleCreateSettlement = useCallback(async () => {
    if (!tUserData?.firstName) {
      popup.open.ifAvailable({
        message: "Unable to create settlement. User data not available.",
      });
      return;
    }

    try {
      mainButton.setParams.ifAvailable({
        isLoaderVisible: true,
      });

      // Create the settlement
      await createSettlementMutation.mutateAsync({
        amount: absAmountOwed,
        receiverId: member.id,
        senderId: userId,
        chatId,
        currency: selectedCurrency,
      });

      // Send notification to creditor
      try {
        await sendSettlementNotificationMutation.mutateAsync({
          chatId,
          creditorUserId: Number(member.id),
          creditorName: member.firstName,
          creditorUsername: member.username || undefined,
          debtorName: tUserData.firstName,
          amount: absAmountOwed,
          currency: dChatData?.baseCurrency || "SGD",
          threadId: dChatData?.threadId
            ? Number(dChatData.threadId)
            : undefined,
        });
      } catch (notificationError) {
        console.error(
          "Error sending settlement notification:",
          notificationError
        );
      }

      hapticFeedback.notificationOccurred.ifAvailable("success");
      onOpenChange(false);
    } catch (error) {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      console.error("Error creating settlement:", error);
      popup.open.ifAvailable({
        message: "Failed to create settlement. Please try again later.",
      });
      return;
    } finally {
      mainButton.setParams.ifAvailable({
        isLoaderVisible: false,
      });
    }
  }, [
    tUserData?.firstName,
    createSettlementMutation,
    absAmountOwed,
    member.id,
    member.firstName,
    member.username,
    userId,
    chatId,
    selectedCurrency,
    onOpenChange,
    sendSettlementNotificationMutation,
    dChatData?.baseCurrency,
    dChatData?.threadId,
  ]);

  // Set main button parameters when modal opens
  useEffect(() => {
    if (!modalOpen) return;

    mainButton.setParams.ifAvailable({
      text: "Yup, I settled! 🤝",
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

  useEffect(() => {
    if (!modalOpen) return;

    const offMainButtonClick = mainButton.onClick.ifAvailable(
      handleCreateSettlement
    );

    return () => {
      offMainButtonClick?.();
    };
  }, [handleCreateSettlement, modalOpen]);

  return (
    <Modal
      header={<Modal.Header>Settle debt?</Modal.Header>}
      open={modalOpen}
      onOpenChange={onOpenChange}
    >
      <div>
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
            src={assetUrls.bananaGun}
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

export default ToPayModal;
