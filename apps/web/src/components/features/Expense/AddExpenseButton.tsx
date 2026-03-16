import { Link } from "@tanstack/react-router";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Button } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";

interface AddExpenseButtonProps {
  chatId: number;
  selectedTab: "balance" | "transaction";
}

const AddExpenseButton = ({ chatId, selectedTab }: AddExpenseButtonProps) => {
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  return (
    <Link
      className="block p-4"
      onClick={() => hapticFeedback.impactOccurred("light")}
      to="/chat/$chatId/add-expense"
      params={{
        chatId: chatId.toString(),
      }}
      search={{
        prevTab: selectedTab,
        title: "+ Add expense",
      }}
    >
      <Button
        size="l"
        stretched
        before={<Plus size={24} />}
        className="w-full rounded-xl"
        style={{
          color: tButtonTextColor,
          backgroundColor: tButtonColor,
        }}
      >
        Add expense
      </Button>
    </Link>
  );
};

export default AddExpenseButton;
