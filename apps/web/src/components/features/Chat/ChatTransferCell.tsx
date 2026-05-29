import { hapticFeedback } from "@telegram-apps/sdk-react";
import {
  Avatar,
  Caption,
  Cell,
  Info,
  Skeleton,
} from "@telegram-apps/telegram-ui";
import { useState } from "react";
import { trpc } from "@utils/trpc";
import { RouterOutputs } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { formatExpenseDateShort } from "@utils/date";
import { formatCurrencyWithCode } from "@/utils/financial";
import { cn } from "@/utils/cn";
import { CSS_CLASSES } from "@/constants/ui";
import { ArrowRight, Forward } from "lucide-react";

type TransferRow = RouterOutputs["debtTransfer"]["getAllByChat"][number];

interface ChatTransferCellProps {
  transfer: TransferRow;
}

const ChatTransferCell = ({ transfer }: ChatTransferCellProps) => {
  const { debtorId, creditorId, sourceChatId, amount, currency, direction } =
    transfer;

  const [highlighted, setHighlighted] = useState(false);

  // Debtor and creditor are members of both chats, so the source chat is a
  // safe lookup scope for either one.
  const { data: debtorMember, isLoading: isDebtorLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId: sourceChatId,
      userId: debtorId,
    });
  const { data: creditorMember, isLoading: isCreditorLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId: sourceChatId,
      userId: creditorId,
    });

  const isLoading = isDebtorLoading || isCreditorLoading;
  const debtorName = debtorMember?.user.first_name ?? `User ${debtorId}`;
  const creditorName = creditorMember?.user.first_name ?? `User ${creditorId}`;

  const title =
    direction === "out"
      ? `Transferred to ${transfer.counterpartChatTitle}`
      : `Transferred from ${transfer.counterpartChatTitle}`;

  return (
    <Cell
      className={cn("transition", {
        [CSS_CLASSES.SELECT_HIGHLIGHT]: highlighted,
      })}
      onClick={() => {
        // No details modal yet; give tactile feedback + a brief highlight.
        setHighlighted(true);
        setTimeout(() => setHighlighted(false), 150);
        hapticFeedback.selectionChanged();
      }}
      before={
        <Avatar size={40}>
          <div className="flex size-full items-center justify-center rounded-full bg-blue-500">
            <Forward size={22} color="white" />
          </div>
        </Avatar>
      }
      subhead={
        <Skeleton visible={isLoading}>
          <Caption weight="1" level="1">
            {title}
          </Caption>
        </Skeleton>
      }
      description={
        <Skeleton visible={isLoading}>
          <Caption weight="2" level="1">
            {debtorName}
          </Caption>
          <span>&rsquo;s debt to </span>
          <Caption weight="2" level="1">
            {creditorName}
          </Caption>
        </Skeleton>
      }
      after={
        <Info
          avatarStack={
            <Info type="text">
              <div className="flex flex-col items-end gap-1.5">
                <Caption className="w-max" weight="2">
                  {formatExpenseDateShort(new Date(transfer.createdAt))}
                </Caption>
                <div className="flex items-center gap-2">
                  <ChatMemberAvatar userId={debtorId} size={28} />
                  <ArrowRight size={20} />
                  <ChatMemberAvatar userId={creditorId} size={28} />
                </div>
              </div>
            </Info>
          }
          type="avatarStack"
        />
      }
    >
      {formatCurrencyWithCode(amount, currency)}
    </Cell>
  );
};

export default ChatTransferCell;
