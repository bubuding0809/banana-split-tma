import { useCallback, useState } from "react";
import {
  Avatar,
  Caption,
  Cell,
  Modal,
  Navigation,
  Section,
  Skeleton,
  Snackbar,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  initDataRaw,
  popup,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { trpc } from "@utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import {
  formatCurrencyWithCode,
  getBalanceColorClass,
} from "@/utils/financial";
import { cn } from "@/utils/cn";
import type { MoveParams } from "./deriveMoveParams";

interface MoveDebtSheetProps {
  open: boolean;
  move: MoveParams | null;
  counterpartyUserId: number;
  counterpartyName: string;
  onOpenChange: (open: boolean) => void;
  onAfterMutate: () => void;
}

export function MoveDebtSheet({
  open,
  move,
  counterpartyUserId,
  counterpartyName,
  onOpenChange,
  onAfterMutate,
}: MoveDebtSheetProps) {
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const targetsQuery = trpc.expenseShare.getEligibleTransferTargets.useQuery(
    {
      counterpartyUserId,
      sourceChatId: move?.sourceChatId ?? 0,
    },
    { enabled: open && move !== null }
  );

  const createTransfer = trpc.debtTransfer.createTransfer.useMutation({
    onSuccess: () => {
      // Mirrors the cache fan-out TransferDetailsModal's delete uses, plus the
      // sheet's own source query so the breakdown refreshes immediately.
      utils.debtTransfer.getAllByChat.invalidate();
      utils.currency.getCurrenciesWithBalance.invalidate();
      utils.chat.getBulkChatDebts.invalidate();
      utils.expenseShare.getMyBalancesAcrossChats.invalidate();
      utils.expenseShare.getMyCounterpartyBalances.invalidate();
      hapticFeedback.notificationOccurred.ifAvailable("success");
      onAfterMutate();
      onOpenChange(false);
    },
    onError: (e) => {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      setSnackbar(e.message || "Failed to move debt");
    },
  });

  const amountText = move
    ? formatCurrencyWithCode(move.amount, move.currency)
    : "";

  const handlePick = useCallback(
    async (target: { chatId: number; chatTitle: string }) => {
      if (!move) return;
      if (createTransfer.isPending) return;
      hapticFeedback.impactOccurred.ifAvailable("medium");
      const choice = await popup.open.ifAvailable({
        title: "Move this debt?",
        message: `Moves ${amountText} from "${move.sourceChatTitle}" to "${target.chatTitle}". Removes it here, adds it there.`,
        buttons: [
          { id: "move", type: "default", text: "Move" },
          { type: "cancel" },
        ],
      });
      if (choice !== "move") return;
      setPendingTargetId(target.chatId);
      try {
        await createTransfer.mutateAsync({
          sourceChatId: move.sourceChatId,
          targetChatId: target.chatId,
          debtorId: move.debtorId,
          creditorId: move.creditorId,
          amount: move.amount,
          currency: move.currency,
        });
      } catch {
        // surfaced by the mutation's onError snackbar
      } finally {
        setPendingTargetId(null);
      }
    },
    [move, amountText, createTransfer]
  );

  if (!move) {
    return (
      <Modal nested open={open} onOpenChange={onOpenChange}>
        <div />
      </Modal>
    );
  }

  const subhead = move.callerOwes
    ? `You owe ${counterpartyName}`
    : `${counterpartyName} owes you`;
  // Signed for colour: you owe → negative/red, owed to you → positive/green.
  const signedNet = move.callerOwes ? -move.amount : move.amount;
  const targets = targetsQuery.data ?? [];

  // Group photo served from the lambda's /api/chat-photo sibling of
  // VITE_TRPC_URL — same construction as GroupPage.
  const TRPC_URL = import.meta.env.VITE_TRPC_URL;
  const CHAT_PHOTO_BASE = TRPC_URL
    ? TRPC_URL.replace(/\/api\/trpc\/?$/, "/api/chat-photo")
    : "/api/chat-photo";
  const rawAuth = initDataRaw();
  const chatPhotoSrc = (chatId: number) =>
    rawAuth
      ? `${CHAT_PHOTO_BASE}/${chatId}?auth=${encodeURIComponent(rawAuth)}`
      : undefined;

  return (
    <Modal
      nested
      header={<Modal.Header>Move debt</Modal.Header>}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex flex-col gap-y-2 pb-8">
        <Section header="Moving from" className="px-3">
          <Cell
            before={<ChatMemberAvatar userId={counterpartyUserId} size={40} />}
            subhead={subhead}
            subtitle={`in ${move.sourceChatTitle}`}
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Text weight="2" className={cn(getBalanceColorClass(signedNet))}>
              {amountText}
            </Text>
          </Cell>
        </Section>

        <Section header="Moving to" className="px-3">
          {targetsQuery.isLoading ? (
            <Cell>
              <Skeleton visible>
                <Text>Loading…</Text>
              </Skeleton>
            </Cell>
          ) : targets.length === 0 ? (
            <div className="flex h-16 items-center justify-center px-4">
              <Caption className="text-center text-gray-500" weight="1">
                No shared groups with {counterpartyName} to move this to.
              </Caption>
            </div>
          ) : (
            targets.map((t) => (
              <Cell
                key={t.chatId}
                onClick={pendingTargetId ? undefined : () => handlePick(t)}
                before={
                  <Avatar size={40} src={chatPhotoSrc(t.chatId)}>
                    {t.chatTitle.charAt(0).toUpperCase()}
                  </Avatar>
                }
                subtitle={`${t.memberCount} ${
                  t.memberCount === 1 ? "member" : "members"
                }`}
                after={
                  pendingTargetId === t.chatId ? (
                    <Skeleton visible>
                      <Text>…</Text>
                    </Skeleton>
                  ) : (
                    <Navigation />
                  )
                }
                style={{ backgroundColor: tSectionBgColor }}
              >
                <Text weight="2">{t.chatTitle}</Text>
              </Cell>
            ))
          )}
        </Section>

        {snackbar && (
          <Snackbar duration={3000} onClose={() => setSnackbar(null)}>
            {snackbar}
          </Snackbar>
        )}
      </div>
    </Modal>
  );
}

export default MoveDebtSheet;
