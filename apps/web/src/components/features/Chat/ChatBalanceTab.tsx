import { initData, useSignal } from "@telegram-apps/sdk-react";
import { Caption, Section, Title } from "@telegram-apps/telegram-ui";

import ChatBalanceCell from "./ChatBalanceCell";
import { trpc } from "@/utils/trpc";

interface ChatBalanceTabProps {
  chatId: number;
}
const ChatBalanceTab = ({ chatId }: ChatBalanceTabProps) => {
  // * Hooks =======================================================================================
  const tUserData = useSignal(initData.user);

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;

  // * Queries =====================================================================================
  const { data: debtors } = trpc.chat.getDebtors.useQuery({ userId, chatId });
  const { data: creditors } = trpc.chat.getCreditors.useQuery({
    userId,
    chatId,
  });

  return (
    <div className="flex flex-col gap-4">
      <Section
        header={
          <Title weight="2" className="px-1 py-2" level="3">
            🤑 Collectables
          </Title>
        }
      >
        {debtors?.map((member) => (
          <ChatBalanceCell key={member.id} member={member} chatId={chatId} />
        ))}
        {debtors?.length === 0 ? (
          <div className="flex h-16 items-center justify-center">
            <Caption className="text-center text-gray-500" weight="1">
              💁 No one owes you
            </Caption>
          </div>
        ) : (
          []
        )}
      </Section>
      <Section
        header={
          <Title weight="2" className="px-1 py-2" level="3">
            🚨 Debts
          </Title>
        }
      >
        {creditors?.map((member) => (
          <ChatBalanceCell key={member.id} member={member} chatId={chatId} />
        ))}
        {creditors?.length === 0 ? (
          <div className="flex h-16 items-center justify-center">
            <Caption className="text-center text-gray-500" weight="1">
              🔥 You are all settled
            </Caption>
          </div>
        ) : (
          []
        )}
      </Section>
    </div>
  );
};

export default ChatBalanceTab;
