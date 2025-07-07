import {
  Badge,
  Caption,
  Cell,
  Info,
  Modal,
  Section,
  Skeleton,
  Text,
} from "@telegram-apps/telegram-ui";
import { type inferRouterOutputs } from "@trpc/server";
import { useCallback } from "react";
import {
  hapticFeedback,
  mainButton,
  popup,
  secondaryButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { useEffect } from "react";

import { trpc } from "@utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import ModalHeader from "@/components/ui/ModalHeader";
import { formatExpenseDate } from "@utils/date";
import { useMemo } from "react";
import { formatCurrency } from "@/utils/financial";

interface SettlementDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settlement: inferRouterOutputs<AppRouter>["settlement"]["getSettlementByChat"][number];
  senderMember:
    | inferRouterOutputs<AppRouter>["telegram"]["getChatMember"]
    | undefined;
  receiverMember:
    | inferRouterOutputs<AppRouter>["telegram"]["getChatMember"]
    | undefined;
  isSenderLoading: boolean;
  isReceiverLoading: boolean;
  userId: number;
}

const SettlementDetailsModal = ({
  open,
  onOpenChange,
  settlement,
  senderMember,
  receiverMember,
  isSenderLoading,
  isReceiverLoading,
  userId,
}: SettlementDetailsModalProps) => {
  //* hooks ========================================================================================
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tDestructiveTextColor = useSignal(themeParams.destructiveTextColor);
  const utils = trpc.useUtils();

  const senderFullName = `${senderMember?.user.first_name}${
    senderMember?.user.last_name ? ` ${senderMember.user.last_name}` : ""
  }`;

  const receiverFullName = `${receiverMember?.user.first_name}${
    receiverMember?.user.last_name ? ` ${receiverMember.user.last_name}` : ""
  }`;

  // Determine the relation of the user to the settlement (sender, receiver, unrelated)
  const settlementRelation = useMemo(() => {
    if (settlement.senderId === userId) return "sender";
    if (settlement.receiverId === userId) return "receiver";
    return "unrelated";
  }, [settlement.senderId, settlement.receiverId, userId]);

  //* Mutations ====================================================================================
  const deleteSettlementMutation = trpc.settlement.deleteSettlement.useMutation(
    {
      onSuccess: () => {
        utils.settlement.getSettlementByChat.invalidate({
          chatId: settlement.chatId,
        });
        onOpenChange(false);
      },
    }
  );

  //* Handlers =====================================================================================
  const handleDeleteSettlement = useCallback(async () => {
    try {
      const result = await popup.open.ifAvailable({
        title: "Delete Settlement",
        message: "You can't undo this action.",
        buttons: [
          { id: "delete-settlement", type: "destructive", text: "Delete" },
          { type: "cancel" },
        ],
      });

      if (result === "delete-settlement") {
        secondaryButton.setParams({
          isLoaderVisible: true,
        });
        await deleteSettlementMutation.mutateAsync({
          settlementId: settlement.id,
        });
      }
    } catch (error) {
      hapticFeedback.notificationOccurred("error");
      console.error("Error showing delete confirmation:", error);
    }
    secondaryButton.setParams({
      isLoaderVisible: false,
    });
  }, [deleteSettlementMutation, settlement.id]);

  const handleEditSettlement = useCallback(() => {
    // TODO: Implement edit functionality
    alert("Chill ah, this is not implemented yet!");
  }, []);

  const getSubtitle = () => {
    switch (settlementRelation) {
      case "sender":
        return `📤 You sent ${formatCurrency(settlement.amount)}`;
      case "receiver":
        return `📥 You received ${formatCurrency(settlement.amount)}`;
      case "unrelated":
        return `🤷 Not involved`;
      default:
        return "";
    }
  };

  const getSubtitleColor = () => {
    switch (settlementRelation) {
      case "sender":
        return "text-red-500";
      case "receiver":
        return "text-green-500";
      case "unrelated":
        return "text-zinc-500";
      default:
        return "text-zinc-500";
    }
  };

  //* Effects ======================================================================================
  // Set up buttons when modal opens
  useEffect(() => {
    if (!open) return;

    mainButton.setParams({
      text: "Edit",
      isVisible: true,
      isEnabled: true,
    });
    secondaryButton.setParams({
      text: "Delete",
      isVisible: true,
      isEnabled: true,
      textColor: tDestructiveTextColor,
    });

    return () => {
      secondaryButton.setParams({ isVisible: false, isEnabled: false });
      mainButton.setParams({ isVisible: false, isEnabled: false });
    };
  }, [open, tDestructiveTextColor]);

  // Attach button handlers
  useEffect(() => {
    if (!open) return;

    const offSecondaryButton = secondaryButton.onClick(handleDeleteSettlement);
    const offMainButton = mainButton.onClick(handleEditSettlement);

    return () => {
      offSecondaryButton();
      offMainButton();
    };
  }, [handleDeleteSettlement, handleEditSettlement, open]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <ModalHeader>
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="flex items-center gap-2">
              <Text weight="2">Settlement Details</Text>
            </div>
            <Badge
              type="number"
              mode="secondary"
              className={getSubtitleColor()}
            >
              <Caption weight="2" className={getSubtitleColor()}>
                {getSubtitle()}
              </Caption>
            </Badge>
          </div>
        </ModalHeader>
      }
    >
      <div className="flex flex-col pb-5">
        {/* Description */}
        {settlement.description && (
          <Section header="What was this settlement for?" className="px-3">
            <Cell
              style={{
                backgroundColor: tSectionBgColor,
              }}
            >
              <Text className="text-wrap">{settlement.description}</Text>
            </Cell>
          </Section>
        )}

        {/* Settlement Overview */}
        <Section header="who settled?" className="px-3">
          <Cell
            before={<ChatMemberAvatar userId={settlement.senderId} size={48} />}
            subtitle={
              <Skeleton visible={isSenderLoading}>
                <Caption>
                  {formatExpenseDate(new Date(settlement.createdAt))}
                </Caption>
              </Skeleton>
            }
            after={
              <Info subtitle="Total" type="text">
                <Text weight="2">{formatCurrency(settlement.amount)}</Text>
              </Info>
            }
            style={{
              backgroundColor: tSectionBgColor,
            }}
          >
            <Skeleton visible={isSenderLoading}>
              <Text weight="2">{senderFullName}</Text>
            </Skeleton>
          </Cell>
        </Section>

        <Section header="who received?" className="px-3">
          <Cell
            before={
              <ChatMemberAvatar userId={settlement.receiverId} size={28} />
            }
            after={
              <Info type="text">
                <Text weight="2" className="text-green-500">
                  {formatCurrency(settlement.amount)}
                </Text>
              </Info>
            }
            style={{
              backgroundColor: tSectionBgColor,
            }}
          >
            <Skeleton visible={isReceiverLoading}>
              <Text weight={settlement.receiverId === userId ? "1" : "3"}>
                {settlement.receiverId === userId ? "You" : receiverFullName}
              </Text>
            </Skeleton>
          </Cell>
        </Section>
      </div>
    </Modal>
  );
};

export default SettlementDetailsModal;
