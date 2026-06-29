import { useCallback, useState } from "react";
import {
  Caption,
  Cell,
  Info,
  Modal,
  Section,
  Skeleton,
  Snackbar,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  popup,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { ArrowRight } from "lucide-react";
import { trpc } from "@utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { formatCurrencyWithCode } from "@/utils/financial";
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

  const debtorLabel = move.callerOwes ? "You" : counterpartyName;
  const creditorLabel = move.callerOwes ? counterpartyName : "you";
  const targets = targetsQuery.data ?? [];

  return (
    <Modal
      nested
      header={<Modal.Header>Move debt</Modal.Header>}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex flex-col gap-y-2 pb-8">
        <Section header="Moving" className="px-3">
          <Cell
            before={<ChatMemberAvatar userId={move.debtorId} size={40} />}
            after={
              <Info subtitle="Amount" type="text">
                <Text weight="2">{amountText}</Text>
              </Info>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Text weight="2">{debtorLabel}</Text>
            <div className="flex items-center gap-1 text-zinc-500">
              <ArrowRight size={14} />
              <Caption>{creditorLabel}</Caption>
            </div>
          </Cell>
          <Cell style={{ backgroundColor: tSectionBgColor }}>
            <Caption className="text-zinc-500">From</Caption>
            <Text weight="2">{move.sourceChatTitle}</Text>
          </Cell>
        </Section>

        <Section header="Move to" className="px-3">
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
                after={
                  pendingTargetId === t.chatId ? (
                    <Skeleton visible>
                      <Text>…</Text>
                    </Skeleton>
                  ) : (
                    <ArrowRight size={16} className="text-zinc-400" />
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
