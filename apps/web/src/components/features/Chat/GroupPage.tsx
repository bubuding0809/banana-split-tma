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
} from "@telegram-apps/telegram-ui";
import useEnsureChatMember from "@hooks/useEnsureChatMember";
import useStartParams from "@hooks/useStartParams";
import { ArrowRightLeft, FileSpreadsheet, Plus, Settings } from "lucide-react";
import { trpc } from "@utils/trpc";
import ChatBalanceTab from "./ChatBalanceTab";
import ChatTransactionTab from "./ChatTransactionTab";
import CurrencyNavCell from "./CurrencyNavCell";
import { useInView } from "react-intersection-observer";
import { cn } from "@/utils/cn";
import { useEffect, useRef, useState } from "react";
import useIsMobile from "@/hooks/useIsMobile";
import { RouterOutputs } from "@dko/trpc";

const routeApi = getRouteApi("/_tma/chat/$chatId");

interface GroupPageProps {
  chatData: RouterOutputs["chat"]["getChat"];
}

const GroupPage = ({ chatData }: GroupPageProps) => {
  // * Hooks =======================================================================================
  const { selectedTab, selectedCurrency } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const tUserData = useSignal(initData.user);
  const tStartParams = useStartParams();
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tSecondaryBgColor = useSignal(themeParams.secondaryBackgroundColor);
  const isMobile = useIsMobile();

  const { ref: headerRef, inView: headerInView } = useInView({
    rootMargin: "80px",
  });
  const firstLoadDoneRef = useRef(false);
  const tabListRef = useRef<HTMLDivElement>(null);
  const headerRefReal = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // * State =======================================================================================
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;
  const chatId = tStartParams?.chat_id ?? 0;

  // * Effects =====================================================================================
  useEffect(() => {
    const isFirstLoadDone = firstLoadDoneRef.current;
    const timeout = setTimeout(() => {
      if (
        selectedTab === "transaction" &&
        tabListRef.current &&
        !isFirstLoadDone
      ) {
        tabListRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
          inline: "nearest",
        });
      }
      firstLoadDoneRef.current = true;
    }, 100);

    return () => clearTimeout(timeout);
  }, [selectedTab]);

  // * Queries =====================================================================================
  const { data: tChatData } = trpc.telegram.getChat.useQuery({
    chatId,
  });

  const handleTabChange = (tab: typeof selectedTab) => {
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

  const handleScrollToScreenTop = () => {
    hapticFeedback.impactOccurred("light");
    topRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
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
    <main className="no-scrollbar flex flex-col">
      {/* Used to scroll screen to top */}
      <div ref={topRef} className="scroll-mt-24" />

      {/* Small group settings header for mobile */}
      {isMobile && (
        <section
          ref={headerRefReal}
          className="fixed left-0 top-0 z-20 flex w-full flex-col items-center justify-center gap-2 pt-[52px] shadow"
          style={{
            backgroundColor: tSectionBgColor,
          }}
        >
          <div
            className={cn(
              "flex items-center gap-2 rounded-full p-1 pe-2 transition-transform",
              headerInView ? "-translate-y-40" : "translate-y-0"
            )}
            style={{
              backgroundColor: tSecondaryBgColor,
            }}
            onClick={handleSettingsClick}
          >
            <Avatar size={28} src={tChatData?.photoUrl?.href} />
            <Caption weight="2" className="max-w-28 truncate" level="2">
              {tChatData?.type !== "private"
                ? tChatData?.title
                : "Private Chat"}
            </Caption>
            <Settings size={18} />
          </div>

          <Text
            weight="2"
            className={cn(
              "absolute top-[58px] transition-opacity",
              !headerInView ? "opacity-0" : "opacity-100"
            )}
          >
            👥 Group
          </Text>

          <Divider className="w-full" />
        </section>
      )}

      {/* Group settings cells*/}
      <div ref={headerRef} className="py-1">
        <Cell
          onClick={handleSettingsClick}
          after={<Navigation className="text-nowrap">Settings</Navigation>}
          before={
            <Avatar
              size={48}
              src={tChatData?.photoUrl?.toString() ?? chatData.photo}
            >
              ⏳
            </Avatar>
          }
          subtitle={`${chatData.members.length} members`}
        >
          {chatData.title}
        </Cell>
      </div>

      <Divider />

      <div>
        <CurrencyNavCell
          modalOpen={currencyModalOpen}
          onModalOpen={setCurrencyModalOpen}
        />
      </div>

      <Divider />

      {/* Main action button */}
      <Link
        className="p-4"
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

      <section
        className="flex h-screen flex-col bg-neutral-50 pt-1 dark:bg-neutral-900/20"
        style={{
          height: `calc(100vh - ${headerRefReal.current?.clientHeight ?? 0}px)`,
        }}
      >
        {/* Tab list */}
        <div className="px-4" ref={tabListRef}>
          <TabsList>
            <TabsList.Item
              onClick={() => {
                handleTabChange("balance");
                handleScrollToScreenTop();
              }}
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
              onClick={() => {
                handleTabChange("transaction");
                tabListRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                  inline: "nearest",
                });
              }}
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
        </div>

        <Divider />

        {/* Render selected tab */}
        {selectedTab === "balance" && <ChatBalanceTab chatId={chatId} />}
        {selectedTab === "transaction" && (
          <div
            className="relative flex-1 overflow-y-auto"
            style={{
              height: `calc(100vh - ${headerRefReal.current?.offsetHeight ?? 0}px - ${tabListRef.current?.offsetHeight ?? 0}px)`,
            }}
          >
            <ChatTransactionTab chatId={chatId} />
          </div>
        )}
      </section>
    </main>
  );
};

export default GroupPage;
