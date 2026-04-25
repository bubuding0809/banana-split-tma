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
import { useMemo } from "react";

import ChatBalanceCell from "./ChatBalanceCell";
import ConvertCurrenciesCell from "./ConvertCurrenciesCell";
import { trpc } from "@/utils/trpc";
interface ChatBalanceTabProps {
  chatId: number;
  isSimplified: boolean;
}
const ChatBalanceTab = ({ chatId, isSimplified }: ChatBalanceTabProps) => {
  // * Hooks =======================================================================================
  const tUserData = useSignal(initData.user);

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;

  // * Queries =====================================================================================
  const { data: debtors, status: getDebtorStatus } =
    trpc.chat.getDebtorsMultiCurrency.useQuery({
      userId,
      chatId,
    });
  const { data: creditors, status: getCreditorStatus } =
    trpc.chat.getCreditorsMultiCurrency.useQuery({
      userId,
      chatId,
    });

  // Simplified debts query - only fetch when simplified mode is enabled
  const { data: simplifiedDebtsData, status: simplifiedDebtsStatus } =
    trpc.chat.getSimplifiedDebtsMultiCurrency.useQuery(
      {
        chatId,
      },
      {
        enabled: isSimplified,
      }
    );

  // * Data Transformation =========================================================================
  // Transform simplified debts into debtors/creditors format
  const transformedData = useMemo(() => {
    if (!isSimplified || !simplifiedDebtsData) {
      return { debtors: debtors || [], creditors: creditors || [] };
    }

    const { simplifiedDebts, chatMembers } = simplifiedDebtsData;
    const memberMap = new Map(chatMembers.map((member) => [member.id, member]));

    const transformedDebtors: Array<NonNullable<typeof debtors>[0]> = [];
    const transformedCreditors: Array<NonNullable<typeof creditors>[0]> = [];

    // Process each simplified debt transaction
    for (const debt of simplifiedDebts) {
      if (debt.toUserId === userId) {
        // Current user will receive money (debtor owes current user)
        const debtorMember = memberMap.get(debt.fromUserId);
        if (debtorMember) {
          transformedDebtors.push({
            ...debtorMember,
            firstName: debtorMember.firstName || "Unknown",
            balances: debt.balances, // Array of currency balances
            createdAt: new Date(),
            updatedAt: new Date(),
            phoneNumber: null,
            phoneNumberRequested: false,
          });
        }
      } else if (debt.fromUserId === userId) {
        // Current user owes money (current user is debtor)
        const creditorMember = memberMap.get(debt.toUserId);
        if (creditorMember) {
          transformedCreditors.push({
            ...creditorMember,
            firstName: creditorMember.firstName || "Unknown",
            balances: debt.balances.map((balance) => ({
              ...balance,
              amount: -balance.amount, // Negative balance = money current user owes
            })),
            createdAt: new Date(),
            updatedAt: new Date(),
            phoneNumber: null,
            phoneNumberRequested: false,
          });
        }
      }
    }

    return {
      debtors: transformedDebtors,
      creditors: transformedCreditors,
    };
  }, [isSimplified, simplifiedDebtsData, debtors, creditors, userId]);

  // * Conditional Data Sources ====================================================================
  const displayDebtors = isSimplified ? transformedData.debtors : debtors || [];
  const displayCreditors = isSimplified
    ? transformedData.creditors
    : creditors || [];
  const displayDebtorStatus = isSimplified
    ? simplifiedDebtsStatus
    : getDebtorStatus;
  const displayCreditorStatus = isSimplified
    ? simplifiedDebtsStatus
    : getCreditorStatus;

  return (
    <section className="pb-8">
      <div className="shadow-xs">
        <ConvertCurrenciesCell chatId={chatId} />
      </div>
      <div className="mt-4 flex flex-col gap-2 px-4">
        <Section
          header={
            <Title weight="2" className="px-1 py-2" level="3">
              🚨 Debts
            </Title>
          }
        >
          {displayCreditorStatus === "pending"
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
          {displayCreditors.map((member) => (
            <ChatBalanceCell
              key={member.id}
              member={member}
              chatId={chatId}
              isSimplified={isSimplified}
              balanceType="creditor"
            />
          ))}
          {displayCreditors.length === 0 &&
          displayCreditorStatus !== "pending" ? (
            <div className="flex h-16 items-center justify-center">
              <Caption className="text-center text-gray-500" weight="1">
                🔥 You are all settled
              </Caption>
            </div>
          ) : (
            []
          )}
        </Section>
        <Section
          header={
            <Title weight="2" className="px-1 py-2" level="3">
              🤑 Collectables
            </Title>
          }
        >
          {displayDebtorStatus === "pending"
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
          {displayDebtors.map((member) => (
            <ChatBalanceCell
              key={member.id}
              member={member}
              chatId={chatId}
              isSimplified={isSimplified}
              balanceType="debtor"
            />
          ))}
          {displayDebtors.length === 0 && displayDebtorStatus !== "pending" ? (
            <div className="flex h-16 items-center justify-center">
              <Caption className="text-center text-gray-500" weight="1">
                💁 No one owes you
              </Caption>
            </div>
          ) : (
            []
          )}
        </Section>
      </div>
    </section>
  );
};

export default ChatBalanceTab;
