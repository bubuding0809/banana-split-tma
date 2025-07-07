import { SegmentedControl } from "@telegram-apps/telegram-ui";
import { useState } from "react";
import ChatExpenseSegment from "./ChatExpenseSegment";
import ChatSettlementSegment from "./ChatSettlementSegment";

interface ChatTransactionTabProps {
  chatId: number;
}

const ChatTransactionTab = ({ chatId }: ChatTransactionTabProps) => {
  const [selectedTab, setSelectedSegment] = useState<"expense" | "settlement">(
    "expense"
  );

  const SelectedSegment = {
    expense: ChatExpenseSegment,
    settlement: ChatSettlementSegment,
  }[selectedTab];

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl>
        <SegmentedControl.Item
          onClick={() => setSelectedSegment("expense")}
          selected={selectedTab === "expense"}
        >
          💸 Expenses
        </SegmentedControl.Item>
        <SegmentedControl.Item
          onClick={() => setSelectedSegment("settlement")}
          selected={selectedTab === "settlement"}
        >
          🤝 Payments
        </SegmentedControl.Item>
      </SegmentedControl>

      <SelectedSegment chatId={chatId} />
    </div>
  );
};

export default ChatTransactionTab;
