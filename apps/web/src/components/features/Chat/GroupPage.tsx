import { Link, getRouteApi } from "@tanstack/react-router";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Button,
  Caption,
  Cell,
  Divider,
  Navigation,
  Text,
  Spinner,
  TabsList,
  Skeleton,
} from "@telegram-apps/telegram-ui";
import useEnsureChatMember from "@hooks/useEnsureChatMember";
import useStartParams from "@hooks/useStartParams";
import { ArrowRightLeft, FileSpreadsheet, Plus } from "lucide-react";
import { trpc } from "@utils/trpc";
import ChatBalanceTab from "./ChatBalanceTab";
import ChatTransactionTab from "./ChatTransactionTab";
import CurrencyNavCell from "./CurrencyNavCell";

const routeApi = getRouteApi("/_tma/chat/$chatId");

const GroupPage = () => {
  // * Hooks ======================================================================================
  const { selectedTab, selectedCurrency } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const tStartParams = useStartParams();
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
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

  const handleSegmentChange = (tab: typeof selectedTab) => {
    hapticFeedback.selectionChanged();
    navigate({
      search: (prev) => ({
        ...prev,
        selectedTab: tab,
      }),
    });
  };

  const handleSettingsClick = () => {
    hapticFeedback.impactOccurred("light");
    navigate({
      to: `settings`,
      search: {
        prevTab: selectedTab,
        prevCurrency: selectedCurrency,
        title: "⚙️ Group Settings",
      },
    });
  };

  // Ensure user is a member of the chat
  const { isPending: isEnsuringChatMember, data: ensureChatMemberData } =
    useEnsureChatMember(
      {
        chatId,
        userId,
      },
      { enabled: userId !== 0 && chatId !== 0 }
    );

  const SelectedTab = {
    balance: ChatBalanceTab,
    transaction: ChatTransactionTab,
  }[selectedTab];

  if (isDChatDataLoading) {
    return (
      <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
        <Spinner size="l" />
        <Caption weight="1">Preparing bananas</Caption>
      </main>
    );
  }

  if (isEnsuringChatMember) {
    return (
      <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
        <Spinner size="l" />
        <Caption weight="1">
          Adding you to {ensureChatMemberData?.title ?? "group"}
        </Caption>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-2.5 pb-4">
      <section className="px-4">
        <Cell
          onClick={handleSettingsClick}
          className="px-0"
          after={
            <Navigation>
              <Skeleton visible={isDChatDataLoading}>Settings</Skeleton>
            </Navigation>
          }
          before={
            <Avatar size={48} src={tChatData?.photoUrl?.toString()}>
              ⏳
            </Avatar>
          }
          subtitle={
            <Skeleton visible={isDChatDataLoading}>
              {tChatData?.type ?? "supergroup"}
            </Skeleton>
          }
        >
          <Skeleton visible={isDChatDataLoading}>
            {dchatData?.title ?? "bananasplitz"}
          </Skeleton>
        </Cell>
      </section>

      <Link
        className="px-4"
        onClick={() => hapticFeedback.impactOccurred("light")}
        to="/chat/$chatId/add-expense"
        params={{
          chatId: chatId.toString(),
        }}
        search={{
          prevTab: selectedTab,
          prevCurrency: selectedCurrency || "SGD",
          title: "+ Add expense",
        }}
      >
        <Button
          size="l"
          stretched
          before={<Plus size={24} />}
          className="rounded-xl"
          style={{
            color: tButtonTextColor,
            backgroundColor: tButtonColor,
          }}
        >
          Add expense
        </Button>
      </Link>

      <Divider />
      <CurrencyNavCell />
      <Divider />

      <section className="flex flex-col gap-4 px-4">
        <TabsList>
          <TabsList.Item
            onClick={() => handleSegmentChange("balance")}
            selected={selectedTab === "balance"}
          >
            <div className="flex items-center justify-center gap-1">
              <FileSpreadsheet size={16} />
              <Text weight={selectedTab === "balance" ? "2" : "3"}>
                Balances
              </Text>
            </div>
          </TabsList.Item>
          <TabsList.Item
            onClick={() => handleSegmentChange("transaction")}
            selected={selectedTab === "transaction"}
          >
            <div className="flex items-center justify-center gap-1">
              <ArrowRightLeft size={16} />
              <Text weight={selectedTab === "transaction" ? "2" : "3"}>
                Transactions
              </Text>
            </div>
          </TabsList.Item>
        </TabsList>
        <SelectedTab chatId={chatId} />
      </section>
    </main>
  );
};

export default GroupPage;
