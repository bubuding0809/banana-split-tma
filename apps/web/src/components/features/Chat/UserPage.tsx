import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Caption,
  Cell,
  Divider,
  Navigation,
  TabsList,
  Text,
} from "@telegram-apps/telegram-ui";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { ArrowRightLeft, Settings, Users } from "lucide-react";
import { useInView } from "react-intersection-observer";
import useIsMobile from "@/hooks/useIsMobile";
import { cn } from "@/utils/cn";
import ChatTransactionTab, {
  type ChatTransactionTabRef,
} from "./ChatTransactionTab";
import CategoryAggregationTicker from "./CategoryAggregationTicker";
import UserBalancesTab from "./UserBalancesTab";
import SnapshotsLink from "../Snapshot/SnapshotsLink";
import AddExpenseButton from "../Expense/AddExpenseButton";
import { trpc } from "@utils/trpc";

const routeApi = getRouteApi("/_tma/chat/");

const UserPage = () => {
  // * Hooks =======================================================================================
  const { selectedTab, categoryFilters = [] } = routeApi.useSearch();
  const tabNavigate = routeApi.useNavigate();
  const navigate = useNavigate();
  const tUserData = useSignal(initData.user);
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

  // Ticker/list shared state — see GroupPage for the same pattern.
  const chatTransactionTabRef = useRef<ChatTransactionTabRef>(null);
  const [pickedMonthKey, setPickedMonthKey] = useState<string | null>(null);
  const programmaticScrollRef = useRef(false);

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;

  // Map the tab values to AddExpenseButton's expected shape (it predates this
  // tab split and only knows "balance" | "transaction").
  const addExpenseTab: "balance" | "transaction" =
    selectedTab === "personal" ? "transaction" : "balance";

  // * Queries =====================================================================================
  // Ticker-only data — tRPC-cached so this is free when ChatTransactionTab
  // also subscribes.
  const { data: categoriesData } = trpc.category.listByChat.useQuery(
    { chatId: userId },
    { enabled: userId > 0 }
  );
  const { data: allExpensesForCounts } =
    trpc.expense.getAllExpensesByChat.useQuery(
      { chatId: userId },
      { enabled: userId > 0 }
    );

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
      void tabNavigate({
        search: (prev) => ({
          ...prev,
          categoryFilters: ids,
          showPayments: ids.length === 0,
        }),
      });
    },
    [tabNavigate]
  );

  // * Effects =====================================================================================
  useEffect(() => {
    const isFirstLoadDone = firstLoadDoneRef.current;
    const timeout = setTimeout(() => {
      if (
        selectedTab === "personal" &&
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

  // * Handlers ====================================================================================
  const handleTabChange = (tab: typeof selectedTab) => {
    hapticFeedback.selectionChanged();
    void tabNavigate({
      search: (prev) => ({
        ...prev,
        selectedTab: tab,
      }),
    });
  };

  const handleSettingsClick = () => {
    hapticFeedback.impactOccurred("light");
    void navigate({
      to: "/chat/$chatId/settings",
      params: { chatId: userId.toString() },
      search: {
        prevTab: addExpenseTab,
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

  return (
    <main className="no-scrollbar flex flex-col">
      {/* Scroll anchor — target for "scroll to top" on tab change */}
      <div ref={topRef} className="scroll-mt-24" />

      {/* Mobile fixed header — clears the iOS status bar and surfaces an
          animated pill when the static header below scrolls out of view.
          Mirrors the pattern in GroupPage. */}
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
            <Avatar size={28} src={tUserData?.photoUrl} />
            <Caption weight="2" className="max-w-28 truncate" level="2">
              Personal Space
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
            🙂 You
          </Text>

          <Divider className="w-full" />
        </section>
      )}

      {/* Static header — same content as before (user cell, snapshots,
          add expense). Tracked by `headerRef` via useInView to drive the
          fixed pill animation above. */}
      <div ref={headerRef} className="py-1">
        <Cell
          onClick={handleSettingsClick}
          after={<Navigation className="text-nowrap">⚙️</Navigation>}
          before={
            <Avatar size={48} src={tUserData?.photoUrl}>
              ⏳
            </Avatar>
          }
          subtitle="Personal Space"
        >
          {tUserData?.firstName} {tUserData?.lastName}
        </Cell>

        <Divider />

        <SnapshotsLink chatId={userId} />

        <Divider />

        <AddExpenseButton chatId={userId} selectedTab={addExpenseTab} />
      </div>

      {/* Tabs section — height sized to viewport minus the fixed header
          so the selected tab always fills the remaining space. */}
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
                handleTabChange("groups");
                handleScrollToScreenTop();
              }}
              selected={selectedTab === "groups"}
            >
              <div className="flex items-center justify-center gap-1">
                <Users size={16} />
                <Text weight={selectedTab === "groups" ? "2" : "3"}>
                  Groups
                </Text>
              </div>
            </TabsList.Item>
            <TabsList.Item
              onClick={() => {
                handleTabChange("personal");
                tabListRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                  inline: "nearest",
                });
              }}
              selected={selectedTab === "personal"}
            >
              <div className="flex items-center justify-center gap-1">
                <ArrowRightLeft size={16} />
                <Text weight={selectedTab === "personal" ? "2" : "3"}>
                  Personal
                </Text>
              </div>
            </TabsList.Item>
          </TabsList>
        </div>

        <Divider />

        {/* Tab content */}
        <div
          className="relative flex-1 overflow-y-auto"
          style={{
            height: `calc(100vh - ${headerRefReal.current?.offsetHeight ?? 0}px - ${tabListRef.current?.offsetHeight ?? 0}px)`,
          }}
        >
          {selectedTab === "groups" && <UserBalancesTab />}
          {selectedTab === "personal" && (
            <ChatTransactionTab
              ref={chatTransactionTabRef}
              chatId={userId}
              onVisibleMonthChange={handleVisibleMonthChange}
            />
          )}
        </div>
      </section>

      {/* Floating category-aggregation ticker — mirrors GroupPage so the
          pill is pinned to the viewport on the personal tab. */}
      {selectedTab === "personal" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
          <CategoryAggregationTicker
            chatId={userId}
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

export default UserPage;
