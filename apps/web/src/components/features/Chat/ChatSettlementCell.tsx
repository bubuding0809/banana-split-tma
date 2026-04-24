import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Badge,
  Caption,
  Cell,
  Info,
  Skeleton,
} from "@telegram-apps/telegram-ui";
import { type inferRouterOutputs } from "@trpc/server";
import { useMemo, useState } from "react";
import { trpc } from "@utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { formatExpenseDateShort } from "@utils/date";
import { formatCurrencyWithCode } from "@/utils/financial";
import SettlementDetailsModal from "./SettlementDetailsModal";
import { cn } from "@/utils/cn";
import { CSS_CLASSES } from "@/constants/ui";
import { ArrowRight, DollarSign, Link } from "lucide-react";

interface ChatSettlementCellProps {
  settlement: inferRouterOutputs<AppRouter>["settlement"]["getSettlementByChat"][number];
}

const ChatSettlementCell = ({ settlement }: ChatSettlementCellProps) => {
  const { senderId, receiverId, chatId, amount, currency } = settlement;

  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const [highlighted, setHighlighted] = useState(false);

  // * Queries =====================================================================================
  const { data: senderMember, isLoading: isSenderLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId,
      userId: senderId,
    });

  const { data: receiverMember, isLoading: isReceiverLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId,
      userId: receiverId,
    });

  // * State =======================================================================================
  const userId = tUserData?.id ?? 0;
  const [isModalOpen, setIsModalOpen] = useState(false);

  const senderFullName = `${senderMember?.user.first_name}${
    senderMember?.user.last_name ? ` ${senderMember.user.last_name}` : ""
  }`;

  const receiverFullName = `${receiverMember?.user.first_name}${
    receiverMember?.user.last_name ? ` ${receiverMember.user.last_name}` : ""
  }`;

  // Determine the relation of the user to the settlement
  const settlementRelation = useMemo(() => {
    if (senderId === userId) return "sender";
    if (receiverId === userId) return "receiver";
    return "unrelated";
  }, [senderId, receiverId, userId]);

  // Determine display information based on relationship
  const displayInfo = useMemo(() => {
    const isLoading = isSenderLoading || isReceiverLoading;

    switch (settlementRelation) {
      case "sender":
        return {
          primaryText: "You paid",
          secondaryText: receiverFullName,
          avatarUserId: receiverId,
          amountColor: "text-red-600", // Money sent out
          statusText: "Sent",
          isLoading,
        };
      case "receiver":
        return {
          primaryText: `${senderFullName} paid`,
          secondaryText: "you",
          avatarUserId: senderId,
          amountColor: "text-green-600", // Money received
          statusText: "Received",
          isLoading,
        };
      case "unrelated":
        return {
          primaryText: `${senderFullName} paid`,
          secondaryText: receiverFullName,
          avatarUserId: senderId,
          amountColor: "text-gray-600", // Neutral
          statusText: "Settlement",
          isLoading,
        };
      default:
        return {
          primaryText: "Settlement",
          secondaryText: "",
          avatarUserId: senderId,
          amountColor: "text-gray-600",
          statusText: "Unknown",
          isLoading,
        };
    }
  }, [
    settlementRelation,
    senderFullName,
    receiverFullName,
    senderId,
    receiverId,
    isSenderLoading,
    isReceiverLoading,
  ]);

  const onOpenChange = (open: boolean) => {
    if (open) {
      setHighlighted(true);
    } else {
      setTimeout(() => {
        setHighlighted(false);
      }, 150);
    }
    setIsModalOpen(open);
  };

  return (
    <>
      <Cell
        className={cn("transition", {
          [CSS_CLASSES.SELECT_HIGHLIGHT]: highlighted,
        })}
        onClick={() => {
          setIsModalOpen(true);
          hapticFeedback.selectionChanged();
        }}
        before={
          <Avatar size={40}>
            <div className="flex size-full items-center justify-center rounded-full bg-green-500">
              <DollarSign size={24} color="white" />
            </div>
          </Avatar>
        }
        subhead={
          <Skeleton visible={displayInfo.isLoading}>
            <Caption
              weight="1"
              level="1"
              style={{
                color:
                  settlementRelation === "sender" ? tButtonColor : undefined,
              }}
            >
              {displayInfo.primaryText}
            </Caption>
            {settlementRelation !== "unrelated" && (
              <Badge type="number">
                <Link size={10} />
              </Badge>
            )}
          </Skeleton>
        }
        description={
          <Skeleton visible={displayInfo.isLoading}>
            <span
              style={{
                color:
                  settlementRelation === "receiver" ? tButtonColor : undefined,
              }}
            >
              to{" "}
            </span>
            <Caption
              weight="2"
              level="1"
              style={{
                color:
                  settlementRelation === "receiver" ? tButtonColor : undefined,
              }}
            >
              {displayInfo.secondaryText}
            </Caption>
          </Skeleton>
        }
        after={
          <Info
            avatarStack={
              <Info type="text">
                <div className="flex flex-col items-end gap-1.5">
                  <Caption className="w-max" weight="2">
                    {formatExpenseDateShort(new Date(settlement.createdAt))}
                  </Caption>
                  <div className="flex items-center gap-2">
                    <ChatMemberAvatar userId={senderId} size={28} />
                    <ArrowRight size={20} />
                    <ChatMemberAvatar userId={receiverId} size={28} />
                  </div>
                </div>
              </Info>
            }
            type="avatarStack"
          />
        }
      >
        {formatCurrencyWithCode(amount, currency)}
      </Cell>

      <SettlementDetailsModal
        open={isModalOpen}
        onOpenChange={onOpenChange}
        settlement={settlement}
        senderMember={senderMember}
        receiverMember={receiverMember}
        isSenderLoading={isSenderLoading}
        isReceiverLoading={isReceiverLoading}
        userId={userId}
      />
    </>
  );
};

export default ChatSettlementCell;
