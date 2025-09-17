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

interface ToPayModalProps {
  modalOpen: boolean;
  onOpenChange: (open: boolean) => void;
  member: NonNullable<RouterOutputs["chat"]["getChat"]>["members"][0] & {
    balance: number;
  };
  convertedBalance?: number;
  currency: string;
  nested?: boolean;
}

const ToPayModal = ({
  onOpenChange,
  modalOpen,
  member,
  convertedBalance,
  currency,
  nested = false,
}: ToPayModalProps) => {
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
  const { data: memberData } = trpc.user.getUser.useQuery({
    userId: member.id,
  });

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
        isEnabled: false,
      });

      // Create the settlement with notification
      await createSettlementMutation.mutateAsync({
        amount: absAmountOwed,
        senderId: userId, // debtor (current user) is the sender
        receiverId: member.id, // creditor is the receiver
        chatId,
        currency: currency,
        sendNotification: true,
        creditorName: member.firstName,
        creditorUsername: member.username || undefined,
        debtorName: tUserData.firstName,
        threadId: dChatData?.threadId,
      });

      hapticFeedback.notificationOccurred.ifAvailable("success");
      onOpenChange(false);
    } catch (error) {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      console.error("Error creating settlement:", error);
      popup.open.ifAvailable({
        message: "Failed to create settlement. Please try again later.",
      });
    } finally {
      mainButton.setParams.ifAvailable({
        isLoaderVisible: false,
        isEnabled: true,
      });
    }
  }, [
    absAmountOwed,
    chatId,
    createSettlementMutation,
    dChatData?.threadId,
    member.firstName,
    member.id,
    member.username,
    onOpenChange,
    currency,
    tUserData?.firstName,
    userId,
  ]);

  // Set main button parameters when modal opens
  useEffect(() => {
    if (!modalOpen) return;

    mainButton.setParams.ifAvailable({
      text: "Settled ✅",
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

  // Clean up secondary button
  useEffect(() => {
    if (!modalOpen) return;

    if (memberData?.phoneNumber) {
      secondaryButton.setParams.ifAvailable({
        isVisible: true,
        isEnabled: true,
        text: `Copy Number 📲`,
      });
    }

    return () =>
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
  }, [memberData?.phoneNumber, modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;

    const offMainButtonClick = mainButton.onClick.ifAvailable(
      handleCreateSettlement
    );

    return () => {
      offMainButtonClick?.();
    };
  }, [handleCreateSettlement, modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;

    const offSecondaryButtonClick = secondaryButton.onClick.ifAvailable(
      async () => {
        if (!memberData?.phoneNumber) {
          hapticFeedback.notificationOccurred.ifAvailable("error");
          return;
        }

        try {
          await navigator.clipboard.writeText(memberData.phoneNumber);
          hapticFeedback.notificationOccurred.ifAvailable("success");
          secondaryButton.setParams.ifAvailable({
            text: "✅ Copied",
            isEnabled: false,
          });
          setTimeout(() => {
            secondaryButton.setParams.ifAvailable({
              text: "Copy Number 📲",
              isEnabled: true,
              isLoaderVisible: false,
            });
          }, 500);
        } catch (error) {
          console.error("Failed to copy to clipboard:", error);
          hapticFeedback.notificationOccurred.ifAvailable("error");
          popup.open.ifAvailable({
            message: "Failed to copy number to clipboard. Please try again.",
          });
        }
      }
    );

    return () => {
      offSecondaryButtonClick?.();
    };
  }, [memberData?.phoneNumber, modalOpen]);

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
              You owe {member.firstName}{" "}
              <span className="text-red-500">
                {formatCurrencyWithCode(absAmountOwed, currency)}
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
