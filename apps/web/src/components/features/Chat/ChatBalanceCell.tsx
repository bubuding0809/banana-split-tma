import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import { Cell, Navigation, Skeleton, Text } from "@telegram-apps/telegram-ui";
import { type inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import { cn } from "@utils/cn";

import { trpc } from "@/utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import {
  formatCurrency,
  getBalanceLabel,
  getBalanceColorClass,
} from "@/utils/financial";

import ToRecieveModal from "./ToReceiveModal";
import ToPayModal from "./ToPayModal";
import { getRouteApi } from "@tanstack/react-router";

const routeApi = getRouteApi("/_tma/chat/$chatId");

interface ChatBalanceCellProps {
  chatId: number;
  member: NonNullable<
    inferRouterOutputs<AppRouter>["chat"]["getChat"]
  >["members"][0] & {
    balance: number;
  };
}

const ChatBalanceCell = ({ chatId, member }: ChatBalanceCellProps) => {
  // * Hooks ======================================================================================
  const tUserData = useSignal(initData.user);
  const { selectedCurrency } = routeApi.useSearch();

  //* State =======================================================================================
  const [modalOpen, setModalOpen] = useState(false);

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;

  // * Queries =====================================================================================
  const { data: memberInfo, isLoading: isMemberInfoLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId,
      userId: member.id,
    });

  const { data: netBalance, status: netBalanceStatus } =
    trpc.chat.getNetShare.useQuery({
      mainUserId: userId,
      targetUserId: member.id,
      chatId,
      currency: selectedCurrency ?? "SGD",
    });

  // * Handlers ====================================================================================
  const handleCellClick = () => {
    if (netBalance === undefined) {
      return hapticFeedback.notificationOccurred.ifAvailable("error");
    }
    hapticFeedback.selectionChanged.ifAvailable();

    setModalOpen(true);
  };

  const BalanceModal =
    netBalanceStatus === "success"
      ? netBalance > 0
        ? ToRecieveModal
        : ToPayModal
      : null;

  const balanceLabel = (() => {
    if (netBalanceStatus === "pending") {
      return "Loading...";
    }
    if (netBalanceStatus === "error") {
      return "Error";
    }
    return getBalanceLabel(netBalance);
  })();

  const balanceAction = (() => {
    if (netBalanceStatus === "pending") {
      return "Loading...";
    }
    if (netBalanceStatus === "error") {
      return "Error";
    }
    return netBalance > 0 ? "Remind" : "Settle";
  })();

  return (
    <>
      <Cell
        key={member.id}
        before={<ChatMemberAvatar userId={member.id} size={48} />}
        subhead={
          <Skeleton visible={isMemberInfoLoading}>
            {memberInfo?.user.first_name ?? "Unknown"} {balanceLabel}
          </Skeleton>
        }
        after={<Navigation>{balanceAction}</Navigation>}
        onClick={() => handleCellClick()}
      >
        <Skeleton visible={netBalanceStatus === "pending"}>
          <Text className={cn(getBalanceColorClass(netBalance))}>
            {formatCurrency(netBalance)}
          </Text>
        </Skeleton>
      </Cell>

      {BalanceModal && (
        <BalanceModal
          modalOpen={modalOpen}
          onOpenChange={setModalOpen}
          member={member}
        />
      )}
    </>
  );
};

export default ChatBalanceCell;
