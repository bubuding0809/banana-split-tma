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

const ToPayModal = ({ onOpenChange, modalOpen, member }: ToPayModalProps) => {
  const trpcUtils = trpc.useUtils();
  const tUserData = useSignal(initData.user);
  const startParams = useStartParams();
  const tSecondaryBgColor = useSignal(themeParams.secondaryBackgroundColor);

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
          currency: "SGD",
          threadId: dChatData?.threadId
            ? Number(dChatData.threadId)
            : undefined,
        });
      } catch (notificationError) {
        // Log notification error but don't fail the settlement
        console.error(
          "Error sending settlement notification:",
          notificationError
        );
        // Settlement was successful, so we still show success
      }

      popup.open.ifAvailable({
        message: "Settlement created successfully! 🤝",
      });
    } catch (error) {
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
    onOpenChange(false);
  }, [
    absAmountOwed,
    dChatData?.threadId,
    chatId,
    createSettlementMutation,
    member.firstName,
    member.id,
    member.username,
    onOpenChange,
    sendSettlementNotificationMutation,
    tUserData?.firstName,
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
  }, [handleCreateSettlement, modalOpen]);

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
