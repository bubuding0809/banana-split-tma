import {
  Badge,
  Caption,
  Cell,
  IconButton,
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
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { formatExpenseDate } from "@utils/date";
import { cn } from "@/utils/cn";
import { useMemo } from "react";
import { formatCurrencyWithCode } from "@/utils/financial";
import { X, Pencil } from "lucide-react";

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
  currency: string;
}

const ShareParticipant = ({
  chatId,
  userId,
  amount,
  isCurrentUser,
  currency,
}: ShareParticipantProps) => {
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const { data: member, isLoading } = trpc.telegram.getChatMember.useQuery({
    chatId,
    userId,
  });

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
            {formatCurrencyWithCode(amount, currency)}
          </Text>
        </Info>
      }
      style={{
        backgroundColor: tSectionBgColor,
      }}
    >
      <Skeleton visible={isLoading && !isCurrentUser}>
        <Text
          weight={isCurrentUser ? "1" : "3"}
          style={{
            color: isCurrentUser ? tButtonColor : "inherit",
          }}
        >
          {memberName}
        </Text>
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
  userId: number;
  onEdit: () => void;
}

const ExpenseDetailsModal = ({
  open,
  onOpenChange,
  expense,
  member,
  isMemberLoading,
  expenseDetails,
  userId,
  onEdit,
}: ExpenseDetailsModalProps) => {
  //* hooks ========================================================================================
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  const isPayerYou = Number(expense.payerId) === Number(userId);
  const memberFullName = isPayerYou
    ? "You"
    : `${member?.user.first_name}${
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
          after={
            <div className="flex items-center gap-2">
              <IconButton size="s" mode="gray" onClick={onEdit} className="p-1">
                <Pencil
                  size={20}
                  strokeWidth={3}
                  style={{ color: tButtonColor }}
                />
              </IconButton>
              <Modal.Close>
                <IconButton
                  size="s"
                  mode="gray"
                  onClick={() => hapticFeedback.impactOccurred("light")}
                >
                  <X
                    size={20}
                    strokeWidth={3}
                    style={{
                      color: tSubtitleTextColor,
                    }}
                  />
                </IconButton>
              </Modal.Close>
            </div>
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
      <div className="flex max-h-[70vh] flex-col overflow-y-auto pb-5">
        {/* Description */}
        <Section header="What was this for?" className="px-3">
          <Cell
            style={{
              backgroundColor: tSectionBgColor,
            }}
          >
            <div className="flex flex-col gap-1">
              <Text className="text-wrap">{expense.description}</Text>
              {expense.categoryIcon && expense.categoryName && (
                <div className="flex items-center gap-1.5 opacity-70">
                  <span className="text-sm">{expense.categoryIcon}</span>
                  <Caption className="text-xs font-medium uppercase tracking-wider">{expense.categoryName}</Caption>
                </div>
              )}
            </div>
          </Cell>
        </Section>

        {/* Overview */}
        <Section header="Who paid for this?" className="px-3">
          <Cell
            before={<ChatMemberAvatar userId={expense.payerId} size={48} />}
            subtitle={
              <Skeleton visible={isMemberLoading}>
                <Caption>{formatExpenseDate(new Date(expense.date))}</Caption>
              </Skeleton>
            }
            after={
              <Info subtitle="Total" type="text">
                <Text weight="2">
                  {formatCurrencyWithCode(expense.amount, expense.currency)}
                </Text>
              </Info>
            }
            style={{
              backgroundColor: tSectionBgColor,
            }}
          >
            <Skeleton visible={isMemberLoading}>
              <Text
                weight="2"
                style={{
                  color: isPayerYou ? tButtonColor : "inherit",
                }}
              >
                {memberFullName} spent
              </Text>
            </Skeleton>
          </Cell>
        </Section>

        {/* Split Details Section */}
        {expenseDetails?.shares && expenseDetails.shares.length > 0 && (
          <Section header="Split amounts" className="px-3">
            {expenseDetails.shares
              .sort((a, b) => {
                // Move current user to front
                if (a.userId === userId) return -1;
                if (b.userId === userId) return 1;
                return 0;
              })
              .map((share) => (
                <ShareParticipant
                  key={share.userId}
                  chatId={expense.chatId}
                  userId={share.userId}
                  amount={share.amount}
                  currency={expense.currency}
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
