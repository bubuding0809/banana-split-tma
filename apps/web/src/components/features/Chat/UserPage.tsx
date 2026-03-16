import { useRef } from "react";
import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import { Avatar, Cell, Divider, Navigation } from "@telegram-apps/telegram-ui";
import { useNavigate } from "@tanstack/react-router";
import ChatTransactionTab from "./ChatTransactionTab";

const UserPage = () => {
  const tUserData = useSignal(initData.user);
  const headerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
      {/* Header */}
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
      </div>

      <Divider />

      {/* Transactions List - explicit height for virtualizer */}
      <div
        className="relative flex-1 overflow-y-auto"
        style={{
          height: `calc(100vh - ${headerRef.current?.offsetHeight ?? 0}px)`,
        }}
      >
        <ChatTransactionTab chatId={userId} />
      </div>
    </main>
  );
};

export default UserPage;
