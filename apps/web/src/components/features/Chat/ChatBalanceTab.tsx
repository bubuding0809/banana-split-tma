import {
  initData,
  themeParams,
  useSignal,
  hapticFeedback,
  popup,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Caption,
  Cell,
  Section,
  Skeleton,
  Title,
  Text,
  Divider,
  Switch,
} from "@telegram-apps/telegram-ui";
import { useMemo } from "react";

import ChatBalanceCell from "./ChatBalanceCell";
import { trpc } from "@/utils/trpc";
import { getRouteApi } from "@tanstack/react-router";
import { WandSparkles } from "lucide-react";

const routeApi = getRouteApi("/_tma/chat/$chatId");
interface ChatBalanceTabProps {
  chatId: number;
}
const ChatBalanceTab = ({ chatId }: ChatBalanceTabProps) => {
  // * Hooks =======================================================================================
  const { selectedCurrency } = routeApi.useSearch();
  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);

  // * Queries =====================================================================================
  const { data: chatData } = trpc.chat.getChat.useQuery({
    chatId,
  });

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;
  const isSimplified = chatData?.debtSimplificationEnabled ?? false;

  // * Mutations ===================================================================================
  const utils = trpc.useUtils();
  const updateChatMutation = trpc.chat.updateChat.useMutation({
    onMutate: () => {
      // Optimistically update the chat data
      utils.chat.getChat.cancel({ chatId });
      utils.chat.getChat.setData({ chatId }, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          debtSimplificationEnabled: !isSimplified,
        };
      });
    },
    onSettled: () => {
      utils.chat.getChat.invalidate({ chatId });
    },
    onError: (error) => {
      console.error("Error updating chat debt simplification", error.message);
      popup.open({
        title: "🚨 Error",
        message:
          "Something went wrong updating debt simplification, please try again later.",
      });
    },
  });

  // * Handlers ====================================================================================
  const handleSimplificationToggle = async () => {
    const newValue = !isSimplified;

    if (!newValue) {
      // If disabling, confirm with the user
      const id = await popup.open.ifAvailable({
        title: "⚠️ Disable debt simplification?",
        message:
          "Reverting to individual debts might complicate the group's balances, make sure to have consulted with the group before proceeding.",
        buttons: [
          {
            type: "ok",
            id: "ok",
          },
          {
            type: "cancel",
          },
        ],
      });

      if (id !== "ok") {
        return;
      }
    } else {
      // If enabling, confirm with the user
      const id = await popup.open.ifAvailable({
        title: "🪄 Enable debt simplification?",
        message:
          "We will peform some magic to reduce the number of payments you have to make, while ensuring the net balances remain the same.",
        buttons: [
          {
            type: "ok",
            id: "ok",
          },
          {
            type: "cancel",
          },
        ],
      });

      if (id !== "ok") {
        return;
      }
    }

    updateChatMutation.mutate({
      chatId,
      debtSimplificationEnabled: newValue,
    });

    // Provide haptic feedback
    hapticFeedback.notificationOccurred("success");
  };

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

  // Simplified debts query - only fetch when simplified mode is enabled
  const { data: simplifiedDebtsData, status: simplifiedDebtsStatus } =
    trpc.chat.getSimplifiedDebts.useQuery(
      {
        chatId,
        currency: selectedCurrency ?? "SGD",
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
            balance: debt.amount, // Positive balance = money owed to current user
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
            balance: -debt.amount, // Negative balance = money current user owes
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
    <section className="flex flex-col gap-2">
      <div>
        <Cell
          Component="label"
          before={
            <span
              className="rounded-lg p-1.5"
              style={{
                backgroundColor: tButtonColor,
              }}
            >
              <WandSparkles size={20} color="white" />
            </span>
          }
          after={
            <Switch
              checked={isSimplified}
              onChange={handleSimplificationToggle}
            />
          }
          description="Combine debts to simplify payments"
          onClick={handleSimplificationToggle}
        >
          Simplify debts
        </Cell>
        <Divider />
      </div>
      <div className="flex flex-col gap-2 px-4">
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
            />
          ))}
          {displayDebtors.length === 0 ? (
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
            />
          ))}
          {displayCreditors.length === 0 ? (
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
    </section>
  );
};

export default ChatBalanceTab;
