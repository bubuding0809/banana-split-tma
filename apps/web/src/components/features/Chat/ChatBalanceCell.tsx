import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import { Cell, Navigation, Skeleton, Text } from "@telegram-apps/telegram-ui";
import { type inferRouterOutputs } from "@trpc/server";
import { useMemo, useState } from "react";
import { cn } from "@utils/cn";

import { trpc } from "@/utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import {
  getBalanceLabel,
  getBalanceColorClass,
  formatCurrencyWithCode,
  toDecimal,
} from "@/utils/financial";

import ToReceiveModal from "./ToReceiveModal";
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
  isSimplified?: boolean;
}

const ChatBalanceCell = ({
  chatId,
  member,
  isSimplified = false,
}: ChatBalanceCellProps) => {
  // * Hooks ======================================================================================
  const tUserData = useSignal(initData.user);
  const { selectedCurrency } = routeApi.useSearch();

  //* State =======================================================================================
  const [modalOpen, setModalOpen] = useState(false);

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;

  // * Queries ===================================================================================
  const { data: chatData } = trpc.chat.getChat.useQuery({
    chatId,
  });

  const { data: conversionRateData, status: conversionRateStatus } =
    trpc.currency.getCurrentRate.useQuery(
      {
        baseCurrency: chatData?.baseCurrency ?? "SGD",
        targetCurrency: selectedCurrency ?? "SGD",
      },
      {
        enabled: !!chatData?.baseCurrency && !!selectedCurrency,
      }
    );

  const { data: memberInfo, isLoading: isMemberInfoLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId,
      userId: member.id,
    });

  const { data: netBalance, status: netBalanceStatus } =
    trpc.chat.getNetShare.useQuery(
      {
        mainUserId: userId,
        targetUserId: member.id,
        chatId,
        currency: selectedCurrency ?? "SGD",
      },
      {
        enabled: !isSimplified,
      }
    );

  // * Computed Values =============================================================================
  // Use member.balance when in simplified mode, otherwise use netBalance from query
  const effectiveBalance = isSimplified ? member.balance : netBalance;
  const effectiveBalanceStatus = isSimplified ? "success" : netBalanceStatus;

  // * Handlers ====================================================================================
  const handleCellClick = () => {
    if (effectiveBalance === undefined) {
      return hapticFeedback.notificationOccurred.ifAvailable("error");
    }
    hapticFeedback.selectionChanged.ifAvailable();

    setModalOpen(true);
  };

  const BalanceModal =
    effectiveBalanceStatus === "success" && effectiveBalance !== undefined
      ? effectiveBalance > 0
        ? ToReceiveModal
        : ToPayModal
      : null;

  const convertedBalance = useMemo(() => {
    if (conversionRateData && effectiveBalance !== undefined) {
      return toDecimal(effectiveBalance)
        .dividedBy(conversionRateData.rate)
        .toNumber();
    }
    return effectiveBalance;
  }, [conversionRateData, effectiveBalance]);

  const balanceLabel = (() => {
    if (effectiveBalanceStatus === "pending") {
      return "Loading...";
    }
    if (effectiveBalanceStatus === "error") {
      return "Error";
    }
    return getBalanceLabel(effectiveBalance);
  })();

  const balanceAction = (() => {
    if (effectiveBalanceStatus === "pending") {
      return "Loading...";
    }
    if (effectiveBalanceStatus === "error") {
      return "Error";
    }
    return effectiveBalance !== undefined && effectiveBalance > 0
      ? "Remind"
      : "Settle";
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
        subtitle={
          selectedCurrency !== chatData?.baseCurrency ? (
            <Skeleton visible={conversionRateStatus === "pending"}>
              or{" "}
              {formatCurrencyWithCode(convertedBalance, chatData?.baseCurrency)}
            </Skeleton>
          ) : null
        }
      >
        <Skeleton
          visible={effectiveBalanceStatus === "pending"}
          className="flex flex-col gap-1"
        >
          <Text className={cn(getBalanceColorClass(effectiveBalance))}>
            {formatCurrencyWithCode(effectiveBalance, selectedCurrency)}
          </Text>
        </Skeleton>
      </Cell>

      {BalanceModal && (
        <BalanceModal
          modalOpen={modalOpen}
          onOpenChange={setModalOpen}
          member={member}
          convertedBalance={convertedBalance}
        />
      )}
    </>
  );
};

export default ChatBalanceCell;
