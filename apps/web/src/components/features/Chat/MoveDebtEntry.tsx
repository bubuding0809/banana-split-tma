import { useState } from "react";
import { Cell, Navigation, Section, Text } from "@telegram-apps/telegram-ui";
import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import { ArrowRightLeft } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { MoveDebtSheet } from "./MoveDebtSheet";
import type { MoveParams } from "./deriveMoveParams";

interface MoveDebtEntryProps {
  /** The chat the debt currently lives in (becomes the transfer source). */
  sourceChatId: number;
  sourceChatTitle: string;
  currency: string;
  /** Absolute owed amount in `currency` for this pair in the source chat. */
  amount: number;
  counterpartyUserId: number;
  counterpartyName: string;
  /** true when the viewer is the debtor (ToPay); false when owed (ToReceive). */
  callerOwes: boolean;
  /** Notifies the host settle modal so it can suppress its native buttons. */
  onOpenChange?: (open: boolean) => void;
  /** Called after a successful move so the host can close itself. */
  onMoved?: () => void;
}

const DISPLAY_THRESHOLD = 0.01;

/**
 * In-group entry point for the cross-group debt move. Rendered inside the
 * per-currency settle modal (ToPay/ToReceive); opens a nested MoveDebtSheet
 * pre-loaded with this chat as the source.
 */
export function MoveDebtEntry({
  sourceChatId,
  sourceChatTitle,
  currency,
  amount,
  counterpartyUserId,
  counterpartyName,
  callerOwes,
  onOpenChange,
  onMoved,
}: MoveDebtEntryProps) {
  const tUser = useSignal(initData.user);
  const callerId = Number(tUser?.id ?? 0);
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  // A settled (near-zero) balance is not transferable.
  if (Math.abs(amount) <= DISPLAY_THRESHOLD) return null;

  const move: MoveParams = {
    debtorId: callerOwes ? callerId : counterpartyUserId,
    creditorId: callerOwes ? counterpartyUserId : callerId,
    amount: Math.abs(amount),
    currency,
    sourceChatId,
    sourceChatTitle,
    callerOwes,
  };

  const setBoth = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const handleAfterMutate = () => {
    // The group balance views read from the multi-currency endpoints, which
    // MoveDebtSheet's own fan-out does not cover — refresh them here.
    utils.chat.getDebtorsMultiCurrency.invalidate({
      chatId: sourceChatId,
      userId: callerId,
    });
    utils.chat.getCreditorsMultiCurrency.invalidate({
      chatId: sourceChatId,
      userId: callerId,
    });
    utils.chat.getSimplifiedDebtsMultiCurrency.invalidate({
      chatId: sourceChatId,
    });
    onMoved?.();
  };

  return (
    <Section className="px-3">
      <Cell
        before={<ArrowRightLeft size={20} className="text-zinc-400" />}
        after={<Navigation />}
        onClick={() => {
          hapticFeedback.impactOccurred.ifAvailable("light");
          setBoth(true);
        }}
      >
        <Text weight="2">Move to another group</Text>
      </Cell>
      <MoveDebtSheet
        open={open}
        move={open ? move : null}
        counterpartyUserId={counterpartyUserId}
        counterpartyName={counterpartyName}
        onOpenChange={(o) => setBoth(o)}
        onAfterMutate={handleAfterMutate}
      />
    </Section>
  );
}

export default MoveDebtEntry;
