import { Cell, Info, Skeleton, Text } from "@telegram-apps/telegram-ui";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { trpc } from "@utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { cn } from "@/utils/cn";
import { formatCurrencyWithCode } from "@/utils/financial";

export interface ShareParticipantProps {
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

export default ShareParticipant;
