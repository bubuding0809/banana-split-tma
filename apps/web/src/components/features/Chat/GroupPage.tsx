import { Link, getRouteApi } from "@tanstack/react-router";
import {
  hapticFeedback,
  initData,
  openTelegramLink,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Button,
  Caption,
  Cell,
  Divider,
  LargeTitle,
  Navigation,
  SegmentedControl,
  Spinner,
  Subheadline,
} from "@telegram-apps/telegram-ui";
import { SegmentedControlItem } from "@telegram-apps/telegram-ui/dist/components/Navigation/SegmentedControl/components/SegmentedControlItem/SegmentedControlItem";
import useEnsureChatMember from "@hooks/useEnsureChatMember";
import useStartParams from "@hooks/useStartParams";
import { Plus } from "lucide-react";
import { useEffect } from "react";

import { trpc } from "@utils/trpc";

import ChatBalanceSegment from "./ChatBalanceSegment";
import ChatExpenseSegment from "./ChatExpenseSegment";

const routeApi = getRouteApi("/_tma/chat/$chatId");

const GroupPage = () => {
  // * Hooks ======================================================================================
  const { selectedSegment } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const tStartParams = useStartParams();
  const tUserData = useSignal(initData.user);

  // * Variables ==================================================================================
  const userId = tUserData?.id ?? 0;
  const chatId = tStartParams?.chat_id ?? 0;

  // * Queries ====================================================================================
  const { data: tChatData } = trpc.telegram.getChat.useQuery({ chatId });
  const { data: dchatData, isLoading: isDChatDataLoading } =
    trpc.chat.getChat.useQuery({
      chatId,
    });
  const {
    isError: isDUserError,
    error: dUserError,
    isLoading: isDUserLoading,
  } = trpc.user.getUser.useQuery({ userId });
  const { data: debtors } = trpc.chat.getDebtors.useQuery({ userId, chatId });
  const { data: creditors } = trpc.chat.getCreditors.useQuery({
    userId,
    chatId,
  });

  // * State ======================================================================================
  const amountLent = Math.abs(
    debtors?.reduce((acc, debtor) => acc + debtor.balance, 0) ?? 0
  );
  const amountBorrowed = Math.abs(
    creditors?.reduce((acc, creditor) => acc + creditor.balance, 0) ?? 0
  );

  const handleSegmentChange = (segment: "expense" | "balance") => {
    hapticFeedback.selectionChanged();
    navigate({
      search: (prev) => ({
        ...prev,
        selectedSegment: segment,
      }),
    });
  };

  //* Effects =====================================================================================
  // Initiate chat with bot if user is not registered
  useEffect(() => {
    if (isDUserError && dUserError?.data?.code === "NOT_FOUND") {
      alert("👋 First time here? Lets get you setup with the bot first!");
      openTelegramLink(
        `${import.meta.env.VITE_TELEGRAM_BOT_DEEP_LINK}?start=register`
      );
    } else if (isDUserError && dUserError?.data?.code !== "NOT_FOUND") {
      alert("❌ Unable to load user data. Please try again later.");
    }
  }, [dUserError, isDUserError]);

  // Ensure user is a member of the chat
  useEnsureChatMember(
    {
      chatId,
      userId,
    },
    { enabled: userId !== 0 && chatId !== 0 }
  );

  if (isDUserLoading || isDChatDataLoading) {
    return (
      <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
        <Spinner size="l" />
        <Caption weight="1">Preparing bananas</Caption>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-2.5 pb-4">
      <section className="px-4">
        <Cell
          onClick={() => alert("Settings")}
          className="px-0"
          after={<Navigation className="text-gray-500">Settings</Navigation>}
          before={<Avatar size={48} src={tChatData?.photoUrl ?? ""} />}
          subtitle={tChatData?.type}
        >
          {dchatData?.title}
        </Cell>
      </section>
      <section className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-2">
        <div className="flex aspect-video w-[97%] flex-none snap-center flex-col rounded-2xl bg-gradient-to-r from-rose-500 to-red-500 p-4 px-5 shadow">
          <div className="flex justify-between">
            <div>
              <Subheadline className="text-white">To pay</Subheadline>
              <LargeTitle weight="1" className="text-white">
                <span className="mr-0.5">$</span>
                {(amountBorrowed ?? 0).toFixed(2)}
              </LargeTitle>
            </div>
            <Button
              size="s"
              onClick={() => alert("Settle")}
              mode="outline"
              className="bg-white/20 ring-1 ring-white/30"
            >
              Settle
            </Button>
          </div>
          <div className="mt-auto flex items-end justify-between">
            <Caption>Owes {creditors?.length ?? 0} person</Caption>
            <span className="text-xl">👎</span>
          </div>
        </div>
        <div className="flex aspect-video w-[97%] flex-none snap-center flex-col rounded-2xl bg-gradient-to-r from-green-400 to-teal-600 p-4 px-5 shadow">
          <div className="flex justify-between">
            <div>
              <Subheadline className="text-white">To receive</Subheadline>
              <LargeTitle weight="1" className="text-white">
                <span className="mr-0.5">$</span>
                {(amountLent ?? 0).toFixed(2)}
              </LargeTitle>
            </div>
            <Button
              size="s"
              onClick={() => alert("Chase")}
              mode="outline"
              className="bg-white/20 ring-1 ring-white/30"
            >
              Chase
            </Button>
          </div>
          <div className="mt-auto flex items-end justify-between">
            <Caption>Lent to {debtors?.length ?? 0} person</Caption>
            <span className="text-xl">👍</span>
          </div>
        </div>
      </section>

      <Divider className="mx-4" />

      <Link
        className="px-4"
        onClick={() => hapticFeedback.impactOccurred("light")}
        to="/chat/$chatId/add-expense"
        params={{
          chatId: chatId.toString(),
        }}
        search={{
          prevSegment: selectedSegment,
          title: "➕ Add expense",
        }}
      >
        <Button
          size="l"
          stretched
          before={<Plus size={24} />}
          className="rounded-xl"
        >
          Add expense
        </Button>
      </Link>

      <Divider className="mx-4" />

      <section className="flex flex-col gap-2 px-4">
        <SegmentedControl>
          <SegmentedControlItem
            onClick={() => handleSegmentChange("balance")}
            selected={selectedSegment === "balance"}
          >
            ⚖️ Balances
          </SegmentedControlItem>
          <SegmentedControlItem
            onClick={() => handleSegmentChange("expense")}
            selected={selectedSegment === "expense"}
          >
            💸 Expenses
          </SegmentedControlItem>
        </SegmentedControl>
        {selectedSegment === "expense" ? (
          <ChatExpenseSegment chatId={chatId} />
        ) : (
          <ChatBalanceSegment chatId={chatId} />
        )}
      </section>
    </main>
  );
};

export default GroupPage;
