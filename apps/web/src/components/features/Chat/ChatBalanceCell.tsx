import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import { Cell, Info, Placeholder } from "@telegram-apps/telegram-ui";
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

  //* State =======================================================================================
  const [modalOpen, setModalOpen] = useState(false);

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;

  // * Queries =====================================================================================
  const { data: memberInfo } = trpc.telegram.getChatMember.useQuery({
    chatId,
    userId: member.id,
  });

  const { data: netBalance, status: netBalanceStatus } =
    trpc.chat.getNetShare.useQuery({
      mainUserId: userId,
      targetUserId: member.id,
      chatId,
    });

  // * Handlers ====================================================================================
  const handleCellClick = () => {
    if (netBalance === undefined) {
      return hapticFeedback.notificationOccurred.ifAvailable("error");
    }
    hapticFeedback.selectionChanged.ifAvailable();

    setModalOpen(true);
  };

  if (netBalanceStatus === "pending") {
    return (
      <Cell
        key={member.id}
        before={<ChatMemberAvatar userId={member.id} size={48} />}
        subtitle="Loading..."
      >
        <Placeholder className="h-6 w-24" />
      </Cell>
    );
  }

  if (netBalanceStatus === "error") {
    return (
      <Cell
        key={member.id}
        before={<ChatMemberAvatar userId={member.id} size={48} />}
        subtitle="Error loading balance"
      >
        <Placeholder className="h-6 w-24" />
      </Cell>
    );
  }

  return (
    <>
      <Cell
        key={member.id}
        before={<ChatMemberAvatar userId={member.id} size={48} />}
        subtitle={memberInfo?.status ?? "Not a chat member"}
        after={
          <Info
            type="text"
            subtitle={getBalanceLabel(netBalance)}
            className={cn(getBalanceColorClass(netBalance))}
          >
            {formatCurrency(netBalance)}
          </Info>
        }
        onClick={() => handleCellClick()}
      >
        {member.firstName} {member.lastName}
      </Cell>

      {netBalance > 0 ? (
        <ToRecieveModal
          modalOpen={modalOpen}
          onOpenChange={setModalOpen}
          member={member}
        />
      ) : (
        <ToPayModal
          modalOpen={modalOpen}
          onOpenChange={setModalOpen}
          member={member}
        />
      )}
    </>
  );
};

export default ChatBalanceCell;
