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
import { useCallback, useEffect } from "react";
import {
  hapticFeedback,
  popup,
  secondaryButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";

import { trpc } from "@utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { formatExpenseDate } from "@utils/date";
import { formatCurrencyWithCode } from "@/utils/financial";
import { X, ArrowRight } from "lucide-react";

type TransferRow =
  inferRouterOutputs<AppRouter>["debtTransfer"]["getAllByChat"][number];
type Member =
  | inferRouterOutputs<AppRouter>["telegram"]["getChatMember"]
  | undefined;

interface TransferDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: TransferRow;
  debtorMember: Member;
  creditorMember: Member;
  isDebtorLoading: boolean;
  isCreditorLoading: boolean;
  userId: number;
}

const fullName = (m: Member, fallbackId: number) =>
  m
    ? `${m.user.first_name}${m.user.last_name ? ` ${m.user.last_name}` : ""}`
    : `User ${fallbackId}`;

const TransferDetailsModal = ({
  open,
  onOpenChange,
  transfer,
  debtorMember,
  creditorMember,
  isDebtorLoading,
  isCreditorLoading,
  userId,
}: TransferDetailsModalProps) => {
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tDestructiveTextColor = useSignal(themeParams.destructiveTextColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  const utils = trpc.useUtils();

  const debtorName = fullName(debtorMember, transfer.debtorId);
  const creditorName = fullName(creditorMember, transfer.creditorId);

  // Viewer-relative subtitle pill.
  const subtitle =
    transfer.debtorId === userId
      ? "🫵 Your debt was moved"
      : transfer.creditorId === userId
        ? "🫰 Owed to you, moved"
        : transfer.direction === "out"
          ? "📤 Transferred out"
          : "📥 Transferred in";

  const deleteMutation = trpc.debtTransfer.deleteTransfer.useMutation({
    onSuccess: () => {
      // Affects both chats' balances + the transfer feed everywhere.
      utils.debtTransfer.getAllByChat.invalidate();
      utils.currency.getCurrenciesWithBalance.invalidate();
      utils.chat.getBulkChatDebts.invalidate();
      utils.expenseShare.getMyBalancesAcrossChats.invalidate();
      hapticFeedback.notificationOccurred("success");
    },
  });

  const handleDelete = useCallback(async () => {
    hapticFeedback.impactOccurred("medium");
    try {
      const result = await popup.open.ifAvailable({
        title: "Delete transfer",
        message:
          "This reverses the transfer in both groups. You can't undo this action.",
        buttons: [
          { id: "delete-transfer", type: "destructive", text: "Delete" },
          { type: "cancel" },
        ],
      });

      if (result === "delete-transfer") {
        secondaryButton.setParams({ isLoaderVisible: true, isEnabled: false });
        await deleteMutation.mutateAsync({ transferId: transfer.id });
        onOpenChange(false);
      }
    } catch (error) {
      hapticFeedback.notificationOccurred("error");
      console.error("Error deleting transfer:", error);
    } finally {
      secondaryButton.setParams({ isLoaderVisible: false, isEnabled: true });
    }
  }, [deleteMutation, onOpenChange, transfer.id]);

  useEffect(() => {
    if (!open) return;
    secondaryButton.setParams({
      text: "Delete",
      isVisible: true,
      isEnabled: true,
      textColor: tDestructiveTextColor,
    });
    return () => {
      secondaryButton.setParams({ isVisible: false, isEnabled: false });
    };
  }, [open, tDestructiveTextColor]);

  useEffect(() => {
    if (!open) return;
    const off = secondaryButton.onClick(handleDelete);
    return () => off();
  }, [handleDelete, open]);

  const amountText = formatCurrencyWithCode(transfer.amount, transfer.currency);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title level="3" weight="1">
              Transfer
            </Title>
          }
          after={
            <Modal.Close>
              <IconButton
                size="s"
                mode="gray"
                onClick={() => hapticFeedback.impactOccurred("light")}
              >
                <X
                  size={20}
                  strokeWidth={3}
                  style={{ color: tSubtitleTextColor }}
                />
              </IconButton>
            </Modal.Close>
          }
        >
          <Badge type="number" mode="secondary">
            <Caption weight="2">{subtitle}</Caption>
          </Badge>
        </Modal.Header>
      }
    >
      <div className="flex flex-col pb-5">
        {transfer.description && (
          <Section header="What was this transfer for?" className="px-3">
            <Cell style={{ backgroundColor: tSectionBgColor }}>
              <Text className="text-wrap">{transfer.description}</Text>
            </Cell>
          </Section>
        )}

        <Section header="movement" className="px-3">
          <Cell
            after={
              <Info type="text">
                <Text weight="2" className="text-green-500">
                  − debt removed
                </Text>
              </Info>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Caption className="text-zinc-500">From</Caption>
            <Text weight="2">{transfer.sourceChatTitle}</Text>
          </Cell>
          <Cell
            after={
              <Info type="text">
                <Text weight="2" className="text-red-500">
                  + debt added
                </Text>
              </Info>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Caption className="text-zinc-500">To</Caption>
            <Text weight="2">{transfer.targetChatTitle}</Text>
          </Cell>
        </Section>

        <Section header="who owes whom" className="px-3">
          <Cell
            before={<ChatMemberAvatar userId={transfer.debtorId} size={40} />}
            after={
              <Info subtitle="Amount" type="text">
                <Text weight="2">{amountText}</Text>
              </Info>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Skeleton visible={isDebtorLoading}>
              <Text weight="2">
                {transfer.debtorId === userId ? "You" : debtorName}
              </Text>
            </Skeleton>
            <div className="flex items-center gap-1 text-zinc-500">
              <ArrowRight size={14} />
              <Skeleton visible={isCreditorLoading}>
                <Caption>
                  {transfer.creditorId === userId ? "you" : creditorName}
                </Caption>
              </Skeleton>
            </div>
          </Cell>
        </Section>

        <Section header="details" className="px-3">
          <Cell
            after={
              <Info type="text">
                <Caption>{formatExpenseDate(new Date(transfer.date))}</Caption>
              </Info>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Caption className="text-zinc-500">Date</Caption>
          </Cell>
        </Section>
      </div>
    </Modal>
  );
};

export default TransferDetailsModal;
