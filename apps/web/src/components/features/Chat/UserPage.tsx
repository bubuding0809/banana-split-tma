import { useRef } from "react";
import { initData, useSignal } from "@telegram-apps/sdk-react";
import { Avatar, Caption, Divider, Text } from "@telegram-apps/telegram-ui";
import { Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import ChatTransactionTab from "./ChatTransactionTab";

const UserPage = () => {
  const tUserData = useSignal(initData.user);
  const headerRef = useRef<HTMLDivElement>(null);

  const userId = tUserData?.id ?? 0;

  return (
    <main className="no-scrollbar flex flex-col">
      {/* Header */}
      <div
        ref={headerRef}
        className="flex items-center justify-between px-4 py-2"
      >
        <div className="flex items-center gap-3">
          <Avatar size={48} src={tUserData?.photoUrl} />
          <div>
            <Text weight="2" className="block">
              {tUserData?.firstName} {tUserData?.lastName}
            </Text>
            <Caption level="1" className="text-gray-500">
              Personal Space
            </Caption>
          </div>
        </div>
        <Link
          to="/settings/api-keys"
          className="p-2 text-gray-500 hover:text-gray-700"
        >
          <Settings size={24} />
        </Link>
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
