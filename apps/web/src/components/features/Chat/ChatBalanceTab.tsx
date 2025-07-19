import { initData, useSignal } from "@telegram-apps/sdk-react";
import {
  Avatar,
  Caption,
  Cell,
  Section,
  Skeleton,
  Title,
  Text,
} from "@telegram-apps/telegram-ui";

import ChatBalanceCell from "./ChatBalanceCell";
import { trpc } from "@/utils/trpc";
import { getRouteApi } from "@tanstack/react-router";

const routeApi = getRouteApi("/_tma/chat/$chatId");
interface ChatBalanceTabProps {
  chatId: number;
}
const ChatBalanceTab = ({ chatId }: ChatBalanceTabProps) => {
  // * Hooks =======================================================================================
  const tUserData = useSignal(initData.user);
  const { selectedCurrency } = routeApi.useSearch();

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;

  // * Queries =====================================================================================
  const { data: debtors, status: getDebtorStatus } =
    trpc.chat.getDebtors.useQuery({
      userId,
      chatId,
      currency: selectedCurrency ?? "SGD",
    });
  const { data: creditors, status: getCreditorStatus } =
    trpc.chat.getCreditors.useQuery({
      userId,
      chatId,
      currency: selectedCurrency ?? "SGD",
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
        {getDebtorStatus === "pending"
          ? Array.from({ length: 2 }).map((_, index) => (
              <Cell
                key={index}
                before={<Avatar size={48} />}
                after={
                  <Skeleton visible>
                    <Text>Loading...</Text>
                  </Skeleton>
                }
                subhead={
                  <Skeleton visible>
                    <Text>Loading...</Text>
                  </Skeleton>
                }
              >
                <Skeleton visible>
                  <Text>Loading...</Text>
                </Skeleton>
              </Cell>
            ))
          : []}
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
        {getCreditorStatus === "pending"
          ? Array.from({ length: 2 }).map((_, index) => (
              <Cell
                key={index}
                before={<Avatar size={48} />}
                after={
                  <Skeleton visible>
                    <Text>Loading...</Text>
                  </Skeleton>
                }
                subhead={
                  <Skeleton visible>
                    <Text>Loading...</Text>
                  </Skeleton>
                }
              >
                <Skeleton visible>
                  <Text>Loading...</Text>
                </Skeleton>
              </Cell>
            ))
          : []}
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
