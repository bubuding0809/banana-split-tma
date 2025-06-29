import {
  Caption,
  Cell,
  Info,
  Modal,
  Section,
  Skeleton,
  Text,
} from "@telegram-apps/telegram-ui";
import { type inferRouterOutputs } from "@trpc/server";

import { trpc } from "@utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { ModalHeader } from "@telegram-apps/telegram-ui/dist/components/Overlays/Modal/components/ModalHeader/ModalHeader";
import {
  themeParamsSectionBackgroundColor,
  useSignal,
} from "@telegram-apps/sdk-react";
import { formatExpenseDate } from "@utils/date";
import { cn } from "@/utils/cn";

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
  const tSectionBgColor = useSignal(themeParamsSectionBackgroundColor);

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
            ${amount.toFixed(2)}
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
  const tSectionBgColor = useSignal(themeParamsSectionBackgroundColor);

  const { payerId, chatId } = expense;

  const memberFullName = `${member?.user.first_name}${
    member?.user.last_name ? ` ${member.user.last_name}` : ""
  }`;

  // Create custom header with status
  const customHeader = <ModalHeader>💸 Expense Details</ModalHeader>;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={customHeader}
      className="pb-10"
    >
      <div className="flex flex-col pb-4">
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
            before={<ChatMemberAvatar userId={payerId} size={48} />}
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
                chatId={chatId}
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
