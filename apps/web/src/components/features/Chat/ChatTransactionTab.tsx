import {
  Modal,
  Placeholder,
  SegmentedControl,
  Title,
} from "@telegram-apps/telegram-ui";
import { useState } from "react";
import ChatExpenseSegment from "./ChatExpenseSegment";
import ChatSettlementSegment from "./ChatSettlementSegment";

interface ChatTransactionTabProps {
  chatId: number;
  setSectionsInView: React.Dispatch<React.SetStateAction<string[]>>;
  filtersOpen: boolean;
  onFiltersOpen: (open: boolean) => void;
}

const ChatTransactionTab = ({
  chatId,
  setSectionsInView,
  filtersOpen,
  onFiltersOpen,
}: ChatTransactionTabProps) => {
  const [selectedSegment, setSelectedSegment] = useState<
    "expense" | "settlement"
  >("expense");

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl>
        <SegmentedControl.Item
          onClick={() => setSelectedSegment("expense")}
          selected={selectedSegment === "expense"}
        >
          💸 Expenses
        </SegmentedControl.Item>
        <SegmentedControl.Item
          onClick={() => setSelectedSegment("settlement")}
          selected={selectedSegment === "settlement"}
        >
          🤝 Payments
        </SegmentedControl.Item>
      </SegmentedControl>

      {selectedSegment === "expense" && (
        <ChatExpenseSegment
          chatId={chatId}
          setSectionsInView={setSectionsInView}
        />
      )}
      {selectedSegment === "settlement" && (
        <ChatSettlementSegment chatId={chatId} />
      )}

      {/* Transaction filters modal */}
      <Modal
        open={filtersOpen}
        header={
          <Modal.Header
            before={
              <Title level="3" weight="1">
                Filters
              </Title>
            }
          />
        }
        onOpenChange={onFiltersOpen}
      >
        <div className="min-h-40">
          <Placeholder
            header="Sorry, still working on it!"
            description="You will be able to filter your transactions soon ..."
          >
            <img
              alt="Telegram sticker"
              src="https://xelene.me/telegram.gif"
              style={{
                display: "block",
                height: "144px",
                width: "144px",
              }}
            />
          </Placeholder>
        </div>
      </Modal>
    </div>
  );
};

export default ChatTransactionTab;
