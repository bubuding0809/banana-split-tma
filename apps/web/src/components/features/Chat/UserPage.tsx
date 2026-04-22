import { useRef } from "react";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Avatar, Cell, Divider, Navigation } from "@telegram-apps/telegram-ui";
import { useNavigate } from "@tanstack/react-router";
import useIsMobile from "@/hooks/useIsMobile";
import ChatTransactionTab from "./ChatTransactionTab";
import SnapshotsLink from "../Snapshot/SnapshotsLink";
import AddExpenseButton from "../Expense/AddExpenseButton";

const UserPage = () => {
  const tUserData = useSignal(initData.user);
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerRefReal = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const userId = tUserData?.id ?? 0;

  const handleSettingsClick = () => {
    hapticFeedback.impactOccurred("light");
    navigate({
      to: "/chat/$chatId/settings",
      params: { chatId: userId.toString() },
      search: {
        prevTab: "transaction",
      },
    });
  };

  return (
    <main className="no-scrollbar flex flex-col">
      {/* Mobile-only fixed header. Reserves the top 52px of the viewport
          to clear the iOS status bar so scrolled content doesn't render
          underneath it. Mirrors the same pattern used in GroupPage. */}
      {isMobile && (
        <section
          ref={headerRefReal}
          className="fixed left-0 top-0 z-20 w-full pt-[52px] shadow"
          style={{ backgroundColor: tSectionBgColor }}
        >
          <Divider className="w-full" />
        </section>
      )}

      {/* Header and Top Actions (wrapped in headerRef for height calculation) */}
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

        <AddExpenseButton chatId={userId} selectedTab="transaction" />

        <Divider />
      </div>

      {/* Transactions List - sized to viewport minus the fixed mobile
          header so the transaction tab always fills the screen while the
          static header above can scroll away naturally. */}
      <div
        className="relative flex-1 overflow-y-auto"
        style={{
          height: `calc(100vh - ${headerRefReal.current?.clientHeight ?? 0}px)`,
        }}
      >
        <ChatTransactionTab chatId={userId} />
      </div>
    </main>
  );
};

export default UserPage;
