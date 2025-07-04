import { initData, useSignal } from "@telegram-apps/sdk-react";
import { Caption, Cell, Info, Skeleton } from "@telegram-apps/telegram-ui";
import { type inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";

import { trpc } from "@utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { formatExpenseDateShort } from "@utils/date";
import { formatCurrency } from "@/utils/financial";

interface ChatSettlementCellProps {
  settlement: inferRouterOutputs<AppRouter>["settlement"]["getSettlementByChat"][number];
}

const ChatSettlementCell = ({ settlement }: ChatSettlementCellProps) => {
  const { senderId, receiverId, chatId, amount } = settlement;
  const tUserData = useSignal(initData.user);

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
          primaryText: "You settled",
          secondaryText: `with ${receiverFullName}`,
          avatarUserId: receiverId,
          amountColor: "text-red-600", // Money sent out
          statusText: "Sent",
          isLoading,
        };
      case "receiver":
        return {
          primaryText: `${senderFullName} settled`,
          secondaryText: "with you",
          avatarUserId: senderId,
          amountColor: "text-green-600", // Money received
          statusText: "Received",
          isLoading,
        };
      case "unrelated":
        return {
          primaryText: `${senderFullName} settled`,
          secondaryText: `with ${receiverFullName}`,
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

  return (
    <Cell
      before={<ChatMemberAvatar userId={senderId} size={48} />}
      subhead={
        <Skeleton visible={displayInfo.isLoading}>
          <Caption weight="1" level="1">
            {displayInfo.primaryText}
          </Caption>
        </Skeleton>
      }
      description={
        <Skeleton visible={displayInfo.isLoading}>
          <Caption weight="1" level="2">
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
                <div className="flex items-center gap-1.5">
                  <span className="text-xl">💰</span>
                  <span>➡︎</span>
                  <ChatMemberAvatar userId={receiverId} size={28} />
                </div>
              </div>
            </Info>
          }
          type="avatarStack"
        />
      }
    >
      {formatCurrency(amount)}
    </Cell>
  );
};

export default ChatSettlementCell;
