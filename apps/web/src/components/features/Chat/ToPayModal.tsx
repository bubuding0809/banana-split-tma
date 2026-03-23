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
import PayNowQR from "./PayNowQR";

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

        {memberData?.phoneNumber && currency === "SGD" && (
          <PayNowQR
            phoneNumber={memberData.phoneNumber}
            amount={absAmountOwed}
            merchantName={member.firstName}
          />
        )}
      </div>
    </Modal>
  );
};

export default ToPayModal;
