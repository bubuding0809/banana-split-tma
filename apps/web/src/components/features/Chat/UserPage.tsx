import { Link } from "@tanstack/react-router";
import { Aperture, Plus } from "lucide-react";
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
} from "@telegram-apps/telegram-ui";
import ChatTransactionTab from "./ChatTransactionTab";

const UserPage = () => {
  const tUserData = useSignal(initData.user);
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const userId = tUserData?.id ?? 0;

  return (
    <main className="no-scrollbar flex h-screen flex-col bg-neutral-50 dark:bg-neutral-900/20">
      {/* Header */}
      <div className="flex items-center gap-3 bg-white px-4 py-2 dark:bg-black">
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

      <Divider />

      <div className="relative flex flex-1 flex-col overflow-y-auto bg-white pb-20 dark:bg-black">
        {/* Snapshots link */}
        <Link
          className="block"
          onClick={() => hapticFeedback.impactOccurred("light")}
          to="/chat/$chatId/snapshots"
          params={{ chatId: userId.toString() }}
          search={{ title: "📸 Snapshots" }}
        >
          <Cell
            Component="div"
            before={
              <span className="rounded-lg bg-red-600 p-1.5">
                <Aperture size={20} color="white" />
              </span>
            }
            after={<Navigation />}
            description="See what you have spent"
          >
            Snapshots
          </Cell>
        </Link>

        <Divider />

        {/* Add Expense Button */}
        <Link
          className="block p-4"
          onClick={() => hapticFeedback.impactOccurred("light")}
          to="/chat/$chatId/add-expense"
          params={{ chatId: userId.toString() }}
          search={{ title: "+ Add expense" }}
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
            Add personal expense
          </Button>
        </Link>

        {/* Transactions List */}
        <div className="mt-2 flex-1">
          <ChatTransactionTab chatId={userId} />
        </div>
      </div>
    </main>
  );
};

export default UserPage;
