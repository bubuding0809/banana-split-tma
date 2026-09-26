import { Link } from "@tanstack/react-router";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Button } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";

interface GroupActionButtonsProps {
  chatId: number;
  selectedTab: "balance" | "transaction";
}

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
          Add expense
        </Button>
      </Link>
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
        <Button size="l" stretched mode="bezeled" className="w-full rounded-xl">
          💸 Payment
        </Button>
      </Link>
    </div>
  );
};

export default GroupActionButtons;
