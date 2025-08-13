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
  IconButton,
} from "@telegram-apps/telegram-ui";
import useEnsureChatMember from "@hooks/useEnsureChatMember";
import useStartParams from "@hooks/useStartParams";
import {
  Aperture,
  ArrowRightLeft,
  ChevronUp,
  FileSpreadsheet,
  Plus,
  Settings,
} from "lucide-react";
import { trpc } from "@utils/trpc";
import ChatBalanceTab from "./ChatBalanceTab";
import ChatTransactionTab from "./ChatTransactionTab";
import CurrencyNavCell from "./CurrencyNavCell";
import { useInView } from "react-intersection-observer";
import { cn } from "@/utils/cn";
import { useMemo, useRef, useState } from "react";
import useIsMobile from "@/hooks/useIsMobile";
import { compareDatesDesc, formatMonthYear } from "@/utils/date";

const routeApi = getRouteApi("/_tma/chat/$chatId");

const GroupPage = () => {
  // * Hooks =======================================================================================
  const { selectedTab, selectedCurrency } = routeApi.useSearch();
  const { ref: headerRef, inView: headerInView } = useInView({
    rootMargin: "80px",
  });
  const { ref, inView } = useInView();
  const headerRefReal = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const navigate = routeApi.useNavigate();
  const tUserData = useSignal(initData.user);
  const tStartParams = useStartParams();
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tSecondaryBgColor = useSignal(themeParams.secondaryBackgroundColor);
  const isMobile = useIsMobile();

  // * State =======================================================================================
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [sectionsInView, setSectionsInView] = useState<string[]>([]);
  const [transctionFilterOpen, setTransactionFilterOpen] = useState(false);

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;
  const chatId = tStartParams?.chat_id ?? 0;

  // * Queries =====================================================================================
  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});
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

  const handleScrollToTop = () => {
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

  const selectedCurrencyInfo = useMemo(() => {
    if (!supportedCurrencies || !selectedCurrency) {
      return null;
    }
    return supportedCurrencies.find(
      (currency) => currency.code === selectedCurrency
    );
  }, [supportedCurrencies, selectedCurrency]);

  const currentSection = useMemo(() => {
    return sectionsInView
      .sort((a, b) => compareDatesDesc(new Date(a), new Date(b)))
      .at(0);
  }, [sectionsInView]);

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
      {/* Used to scroll screen to top */}
      <div ref={topRef} />

      <section ref={headerRef}>
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
      <CurrencyNavCell
        modalOpen={currencyModalOpen}
        onModalOpen={setCurrencyModalOpen}
      />
      <Divider />

      <section className="flex flex-col">
        <div ref={ref}>
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
        </div>

        {/* Transaction banner */}
        <div
          className={cn(
            "fixed left-0 z-20 w-full shadow",
            inView ? "invisible" : "visible"
          )}
          style={{
            top: isMobile
              ? `${headerRefReal.current?.getBoundingClientRect().height}px`
              : 0,
            backgroundColor: tSectionBgColor,
          }}
        >
          <Cell
            before={
              <button
                className="text-3xl"
                onClick={() => setCurrencyModalOpen(true)}
              >
                {selectedCurrencyInfo?.flagEmoji ?? "🌏"}
              </button>
            }
            after={
              <button onClick={() => setTransactionFilterOpen(true)}>
                <Navigation>Filters</Navigation>
              </button>
            }
            description="Transactions"
          >
            {formatMonthYear(new Date(currentSection ?? 0))}
          </Cell>
          <Divider />
        </div>

        {/* Render selected tab */}
        {selectedTab === "balance" && <ChatBalanceTab chatId={chatId} />}
        {selectedTab === "transaction" && (
          <ChatTransactionTab
            chatId={chatId}
            filtersOpen={transctionFilterOpen}
            onFiltersOpen={setTransactionFilterOpen}
            setSectionsInView={setSectionsInView}
          />
        )}
      </section>

      <div
        className={cn(
          "fixed bottom-10 right-5 flex flex-col gap-2 rounded-full p-1 shadow transition-transform",
          selectedTab === "transaction" ? "translate-x-0" : "translate-x-20"
        )}
        style={{
          backgroundColor: tSecondaryBgColor,
        }}
      >
        {!inView && (
          <IconButton size="s" onClick={handleScrollToTop} mode="gray">
            <ChevronUp />
          </IconButton>
        )}

        {/* Snapshots */}
        <Link
          onClick={() => hapticFeedback.impactOccurred("light")}
          to="/chat/$chatId/snapshots"
          params={{
            chatId: chatId.toString(),
          }}
          search={{
            selectedCurrency: selectedCurrency || "SGD",
            title: "📸 Snapshots",
          }}
        >
          {/* Scroll to top button */}
          <IconButton
            size="s"
            style={{
              backgroundColor: tButtonColor,
              color: tButtonTextColor,
            }}
          >
            <Aperture />
          </IconButton>
        </Link>
      </div>
    </main>
  );
};

export default GroupPage;
