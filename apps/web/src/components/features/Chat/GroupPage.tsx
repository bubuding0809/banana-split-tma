import { getRouteApi, useSearch } from "@tanstack/react-router";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
  popup,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Caption,
  Cell,
  Divider,
  Navigation,
  Text,
  Spinner,
  TabsList,
  Switch,
} from "@telegram-apps/telegram-ui";
import useEnsureChatMember from "@hooks/useEnsureChatMember";
import useStartParams from "@hooks/useStartParams";
import {
  ArrowRightLeft,
  FileSpreadsheet,
  Settings,
  WandSparkles,
} from "lucide-react";
import { trpc } from "@utils/trpc";
import ChatBalanceTab from "./ChatBalanceTab";
import ChatTransactionTab, {
  type ChatTransactionTabRef,
} from "./ChatTransactionTab";
import CategoryAggregationTicker from "./CategoryAggregationTicker";
import SnapshotsLink from "../Snapshot/SnapshotsLink";
import AddExpenseButton from "../Expense/AddExpenseButton";
import { useInView } from "react-intersection-observer";
import { cn } from "@/utils/cn";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useIsMobile from "@/hooks/useIsMobile";
import { RouterOutputs } from "@dko/trpc";

const routeApi = getRouteApi("/_tma/chat/$chatId");

interface GroupPageProps {
  chatData: RouterOutputs["chat"]["getChat"];
}

const GroupPage = ({ chatData }: GroupPageProps) => {
  // * Hooks =======================================================================================
  const { selectedTab } = routeApi.useSearch();
  const { categoryFilters = [] } = useSearch({ strict: false }) as {
    categoryFilters?: string[];
  };
  const navigate = routeApi.useNavigate();
  const tUserData = useSignal(initData.user);
  const tStartParams = useStartParams();
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tSecondaryBgColor = useSignal(themeParams.secondaryBackgroundColor);
  const isMobile = useIsMobile();

  // * Variables ===================================================================================
  const isSimplified = chatData?.debtSimplificationEnabled ?? false;

  // * Mutations ===================================================================================
  const utils = trpc.useUtils();
  const updateChatMutation = trpc.chat.updateChat.useMutation({
    onMutate: () => {
      // Optimistically update the chat data
      utils.chat.getChat.cancel({ chatId });
      utils.chat.getChat.setData({ chatId }, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          debtSimplificationEnabled: !isSimplified,
        };
      });
    },
    onSettled: () => {
      utils.chat.getChat.invalidate({ chatId });
    },
    onError: (error) => {
      console.error("Error updating chat debt simplification", error.message);
      popup.open({
        title: "🚨 Error",
        message:
          "Something went wrong updating debt simplification, please try again later.",
      });
    },
  });

  // * Handlers ====================================================================================
  const handleSimplificationToggle = async () => {
    const newValue = !isSimplified;

    if (!newValue) {
      // If disabling, confirm with the user
      const id = await popup.open.ifAvailable({
        title: "⚠️ Disable debt simplification?",
        message:
          "Reverting to individual debts might complicate the group's balances, make sure to have consulted with the group before proceeding.",
        buttons: [
          {
            type: "ok",
            id: "ok",
          },
          {
            type: "cancel",
          },
        ],
      });

      if (id !== "ok") {
        return;
      }
    } else {
      // If enabling, confirm with the user
      const id = await popup.open.ifAvailable({
        title: "🪄 Enable debt simplification?",
        message:
          "We will peform some magic to reduce the number of payments you have to make, while ensuring the net balances remain the same.",
        buttons: [
          {
            type: "ok",
            id: "ok",
          },
          {
            type: "cancel",
          },
        ],
      });

      if (id !== "ok") {
        return;
      }
    }

    updateChatMutation.mutate({
      chatId,
      debtSimplificationEnabled: newValue,
    });

    // Provide haptic feedback
    hapticFeedback.notificationOccurred("success");
  };

  const { ref: headerRef, inView: headerInView } = useInView({
    rootMargin: "80px",
  });
  const firstLoadDoneRef = useRef(false);
  const tabListRef = useRef<HTMLDivElement>(null);
  const headerRefReal = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Shared "which month is the user looking at" state. The ticker's
  // month picker and the list's scroll position both read/write here,
  // making them a two-way sync pair. `programmaticScrollRef` suppresses
  // the scroll → picker callback while a picker-driven scroll is in
  // flight so we don't get a feedback loop.
  const chatTransactionTabRef = useRef<ChatTransactionTabRef>(null);
  const [pickedMonthKey, setPickedMonthKey] = useState<string | null>(null);
  const programmaticScrollRef = useRef(false);

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
  // Ticker-only data — both queries are tRPC-cached, so pulling them
  // here costs nothing when ChatTransactionTab later asks for them too.
  const { data: categoriesData } = trpc.category.listByChat.useQuery(
    { chatId },
    { enabled: chatId > 0 }
  );
  const { data: allExpensesForCounts } =
    trpc.expense.getAllExpensesByChat.useQuery(
      { chatId },
      { enabled: chatId > 0 }
    );

  // Count expenses per categoryId (null → "none" bucket). Only used to
  // decide whether to show a chip in the filter strip — a category with
  // zero tagged expenses is noise unless it's already selected.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of allExpensesForCounts ?? []) {
      const key = e.categoryId ?? "none";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [allExpensesForCounts]);

  const selectedFilterSet = useMemo(
    () => new Set(categoryFilters),
    [categoryFilters]
  );
  const allCategories = useMemo(
    () =>
      (categoriesData?.items ?? []).filter(
        (c) => (categoryCounts[c.id] ?? 0) > 0 || selectedFilterSet.has(c.id)
      ),
    [categoriesData, categoryCounts, selectedFilterSet]
  );

  // * Ticker handlers =============================================================================
  const handlePickedMonthChange = useCallback(
    async (monthKey: string | null) => {
      setPickedMonthKey(monthKey);
      if (!monthKey) return;
      programmaticScrollRef.current = true;
      await chatTransactionTabRef.current?.scrollToMonth(monthKey);
      // Scroll event fires on next paint; release the guard two rAF
      // ticks out so our own scroll doesn't bounce back through the
      // visible-month callback.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      });
    },
    []
  );

  const handleVisibleMonthChange = useCallback((monthKey: string | null) => {
    if (programmaticScrollRef.current) return;
    if (!monthKey) return;
    setPickedMonthKey((prev) => (prev === monthKey ? prev : monthKey));
  }, []);

  const handleCategoryFiltersChange = useCallback(
    (ids: string[]) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          categoryFilters: ids,
          // Payments don't carry a categoryId, so letting them pass
          // through an active category filter reads as junk. Flip the
          // toggle in lockstep: off when any category is selected,
          // back on when all are cleared.
          showPayments: ids.length === 0,
        }),
      });
    },
    [navigate]
  );

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
          after={<Navigation className="text-nowrap">⚙️</Navigation>}
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

      {/* Snapshots link */}
      <SnapshotsLink chatId={chatId} />

      <Divider />

      {/* Simplify debts toggle */}
      <Cell
        Component="label"
        before={
          <span
            className="rounded-lg p-1.5"
            style={{
              backgroundColor: tButtonColor,
            }}
          >
            <WandSparkles size={20} color="white" />
          </span>
        }
        after={
          <Switch
            checked={isSimplified}
            onChange={handleSimplificationToggle}
          />
        }
        description="Combine debts to simplify payments"
        onClick={handleSimplificationToggle}
      >
        Simplify debts
      </Cell>

      <Divider />

      {/* Main action button */}
      <AddExpenseButton chatId={chatId} selectedTab={selectedTab} />

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
        <div
          className="relative flex-1 overflow-y-auto"
          style={{
            height: `calc(100vh - ${headerRefReal.current?.offsetHeight ?? 0}px - ${tabListRef.current?.offsetHeight ?? 0}px)`,
          }}
        >
          {selectedTab === "balance" && (
            <ChatBalanceTab chatId={chatId} isSimplified={isSimplified} />
          )}
          {selectedTab === "transaction" && (
            <ChatTransactionTab
              ref={chatTransactionTabRef}
              chatId={chatId}
              onVisibleMonthChange={handleVisibleMonthChange}
            />
          )}
        </div>
      </section>

      {/* Floating category-aggregation ticker. Pinned to the viewport
          bottom so it stays visible as soon as the transaction tab is
          selected, independent of the tab's internal scroll container.
          pointer-events-none on the wrapper lets taps pass through the
          empty margin around the pill; the pill itself re-enables them. */}
      {selectedTab === "transaction" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
          <CategoryAggregationTicker
            chatId={chatId}
            userId={userId}
            categoryFilters={categoryFilters}
            categories={allCategories}
            pickedMonthKey={pickedMonthKey}
            onPickedMonthChange={handlePickedMonthChange}
            onCategoryFiltersChange={handleCategoryFiltersChange}
          />
        </div>
      )}
    </main>
  );
};

export default GroupPage;
