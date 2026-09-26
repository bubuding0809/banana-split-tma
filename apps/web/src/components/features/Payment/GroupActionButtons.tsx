import { Link } from "@tanstack/react-router";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Button } from "@telegram-apps/telegram-ui";
import { HandCoins, Plus } from "lucide-react";

interface GroupActionButtonsProps {
  chatId: number;
  selectedTab: "balance" | "transaction";
}

// Secondary action on the left, primary (filled) on the right — the same
// order as Telegram's native bottom bar.
const GroupActionButtons = ({
  chatId,
  selectedTab,
}: GroupActionButtonsProps) => {
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  return (
    <div className="flex gap-2 p-4">
      <Link
        className="block flex-1"
        onClick={() => hapticFeedback.impactOccurred("light")}
        to="/chat/$chatId/record-payment"
        params={{ chatId: chatId.toString() }}
        search={{
          prevTab: selectedTab,
          currentFormStep: 0,
          title: "💸 Record payment",
        }}
      >
        <Button
          size="l"
          stretched
          mode="bezeled"
          before={<HandCoins size={24} />}
          className="w-full rounded-xl"
        >
          Pay
        </Button>
      </Link>
      <Link
        className="block flex-1"
        onClick={() => hapticFeedback.impactOccurred("light")}
        to="/chat/$chatId/add-expense"
        params={{ chatId: chatId.toString() }}
        search={{ prevTab: selectedTab, title: "+ Add expense" }}
      >
        <Button
          size="l"
          stretched
          before={<Plus size={24} />}
          className="w-full rounded-xl"
          style={{ color: tButtonTextColor, backgroundColor: tButtonColor }}
        >
          Expense
        </Button>
      </Link>
    </div>
  );
};

export default GroupActionButtons;
