import {
  Badge,
  Caption,
  Cell,
  Info,
  Modal,
  Section,
  Skeleton,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import { type inferRouterOutputs } from "@trpc/server";

import { trpc } from "@utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { formatExpenseDate } from "@utils/date";
import { cn } from "@/utils/cn";
import { useMemo } from "react";
import { formatCurrency } from "@/utils/financial";

const splitModeMap = {
  EQUAL: "Split equally",
  PERCENTAGE: "Split by percentage",
  EXACT: "Split exactly",
  SHARES: "Split by shares",
} as const;

interface ShareParticipantProps {
  chatId: number;
  userId: number;
  amount: number;
  isCurrentUser: boolean;
}

const ShareParticipant = ({
  chatId,
  userId,
  amount,
  isCurrentUser,
}: ShareParticipantProps) => {
  const { data: member, isLoading } = trpc.telegram.getChatMember.useQuery({
    chatId,
    userId,
  });
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);

  const memberName = isCurrentUser
    ? "You"
    : member
      ? `${member.user.first_name}${member.user.last_name ? ` ${member.user.last_name}` : ""}`
      : `User ${userId}`;

  return (
    <Cell
      before={<ChatMemberAvatar userId={userId} size={28} />}
      after={
        <Info type="text">
          <Text weight="2" className={cn(isCurrentUser && "text-red-500")}>
            {formatCurrency(amount)}
          </Text>
        </Info>
      }
      style={{
        backgroundColor: tSectionBgColor,
      }}
    >
      <Skeleton visible={isLoading && !isCurrentUser}>
        <Text weight={isCurrentUser ? "1" : "3"}>{memberName}</Text>
      </Skeleton>
    </Cell>
  );
};

interface ExpenseDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: inferRouterOutputs<AppRouter>["expense"]["getExpenseByChat"][number];
  member:
    | inferRouterOutputs<AppRouter>["telegram"]["getChatMember"]
    | undefined;
  isMemberLoading: boolean;
  expenseDetails:
    | inferRouterOutputs<AppRouter>["expense"]["getExpenseDetails"]
    | undefined;
  isExpenseDetailsLoading: boolean;
  userId: number;
}

const ExpenseDetailsModal = ({
  open,
  onOpenChange,
  expense,
  member,
  isMemberLoading,
  expenseDetails,
  userId,
}: ExpenseDetailsModalProps) => {
  //* hooks ========================================================================================
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);

  const memberFullName = `${member?.user.first_name}${
    member?.user.last_name ? ` ${member.user.last_name}` : ""
  }`;

  // Determine the relation of the user to the expense (payer, borrower, unrelated)
  const expenseRelation = useMemo(() => {
    const payerIsYou = expense.payerId === userId;
    const isUnrelated =
      !payerIsYou &&
      !expenseDetails?.shares.some((share) => share.userId === userId);

    switch (true) {
      case payerIsYou:
        return "payer";
      case isUnrelated:
        return "unrelated";
      default:
        return "borrower";
    }
  }, [expenseDetails?.shares, expense.payerId, userId]);

  // Amount borrowed for this expense
  const borrowedAmount = useMemo(() => {
    if (expenseRelation !== "borrower") return 0;
    return (
      expenseDetails?.shares.reduce((acc, share) => {
        const isCreditor = share.userId === userId;
        if (isCreditor) return acc + share.amount;
        return acc;
      }, 0) ?? 0
    );
  }, [userId, expenseDetails, expenseRelation]);

  // Amount lent for this expense
  const lentAmount = useMemo(() => {
    if (expenseRelation !== "payer") return 0;
    return (
      expenseDetails?.shares.reduce((acc, share) => {
        const isDebtor = share.userId !== userId;
        if (isDebtor) return acc + share.amount;
        return acc;
      }, 0) ?? 0
    );
  }, [expenseRelation, expenseDetails?.shares, userId]);

  //* Handlers =====================================================================================
  const getSubtitle = () => {
    switch (expenseRelation) {
      case "unrelated":
        return "🤷‍♂️ Not involved";
      case "borrower":
        return `🚨 You owe $${borrowedAmount.toFixed(2)}`;
      case "payer":
        return lentAmount === 0
          ? "✅ Even"
          : `💸 You're owed $${lentAmount.toFixed(2)}`;
      default:
        return "";
    }
  };

  const getSubtitleColor = () => {
    switch (expenseRelation) {
      case "unrelated":
        return "text-zinc-500";
      case "borrower":
        return "text-red-500";
      case "payer":
        return lentAmount === 0 ? "text-zinc-500" : "text-green-500";
      default:
        return "text-zinc-500";
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title level="3" weight="1">
              Expense
            </Title>
          }
        >
          <Badge type="number" mode="secondary" className={getSubtitleColor()}>
            <Caption weight="2" className={getSubtitleColor()}>
              {getSubtitle()}
            </Caption>
          </Badge>
        </Modal.Header>
      }
    >
      <div className="flex flex-col pb-5">
        {/* Description */}
        <Section header="What was this for?" className="px-3">
          <Cell
            style={{
              backgroundColor: tSectionBgColor,
            }}
          >
            <Text className="text-wrap">{expense.description}</Text>
          </Cell>
        </Section>

        {/* Overview */}
        <Section header="Who paid for this?" className="px-3">
          <Cell
            before={<ChatMemberAvatar userId={expense.payerId} size={48} />}
            subtitle={
              <Skeleton visible={isMemberLoading}>
                <Caption>
                  {formatExpenseDate(new Date(expense.createdAt))}
                </Caption>
              </Skeleton>
            }
            after={
              <Info subtitle="Total" type="text">
                <Text weight="2">${expense.amount.toFixed(2)}</Text>
              </Info>
            }
            style={{
              backgroundColor: tSectionBgColor,
            }}
          >
            <Skeleton visible={isMemberLoading}>
              <Text weight="2">{memberFullName} paid</Text>
            </Skeleton>
          </Cell>
        </Section>

        {/* Split Details Section */}
        {expenseDetails?.shares && expenseDetails.shares.length > 0 && (
          <Section header="Split amounts" className="px-3">
            {expenseDetails.shares.map((share) => (
              <ShareParticipant
                key={share.userId}
                chatId={expense.chatId}
                userId={share.userId}
                amount={share.amount}
                isCurrentUser={share.userId === Number(userId)}
              />
            ))}
          </Section>
        )}

        {/* Meta Information */}
        <Section className="px-3" header="How was this expense split?">
          <Cell
            after={
              <Text className="text-gray-400">
                {splitModeMap[expense.splitMode]}
              </Text>
            }
            style={{
              backgroundColor: tSectionBgColor,
            }}
          >
            <Text weight="2">Split Method</Text>
          </Cell>
        </Section>
      </div>
    </Modal>
  );
};

export default ExpenseDetailsModal;
