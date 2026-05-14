import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Caption,
  Cell,
  Info,
  Modal,
  Section,
  Snackbar,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  mainButton,
  secondaryButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { cn } from "@/utils/cn";
import { trpc } from "@/utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import {
  formatCurrencyWithCode,
  getBalanceColorClass,
} from "@/utils/financial";
import PayNowQR from "./PayNowQR";

interface Group {
  chatId: number;
  chatTitle: string;
  currency: string;
  nativeNet: number;
  baseNet: number;
}
interface Counterparty {
  userId: number;
  firstName: string;
  lastName: string | null;
  hasStartedBot: boolean;
  /** epoch ms — null when caller can nudge right now */
  nudgeCooldownUntil: number | null;
  totalBaseNet: number;
  groups: Group[];
}

// Compact human-readable countdown — "23h 47m", "47m", "30s".
function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "0s";
  const totalSec = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

interface Props {
  open: boolean;
  counterparty: Counterparty | null;
  baseCurrency: string;
  currencyMap: Map<string, { code: string; name: string; flagEmoji: string }>;
  onOpenChange: (open: boolean) => void;
  onAfterMutate: () => void;
}

export function CounterpartyBalanceSheet({
  open,
  counterparty,
  baseCurrency,
  currencyMap,
  onOpenChange,
  onAfterMutate,
}: Props) {
  const tSubtitleColor = useSignal(themeParams.subtitleTextColor);
  const [snackbar, setSnackbar] = useState<{ text: string } | null>(null);
  const showSnackbar = useCallback((text: string) => setSnackbar({ text }), []);
  // Optimistic cooldown override for the just-nudged case (server's
  // counterparty.nudgeCooldownUntil only updates on next refetch).
  const [optimisticCooldown, setOptimisticCooldown] = useState<number | null>(
    null
  );
  // Tick once per second so the countdown re-renders when active.
  const [, setNow] = useState(Date.now());
  const cooldownUntil = useMemo(() => {
    const fromServer = counterparty?.nudgeCooldownUntil ?? null;
    if (optimisticCooldown && fromServer)
      return Math.max(optimisticCooldown, fromServer);
    return optimisticCooldown ?? fromServer;
  }, [optimisticCooldown, counterparty?.nudgeCooldownUntil]);
  useEffect(() => {
    if (!cooldownUntil) return;
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);
  // Reset the optimistic value when the sheet closes or counterparty
  // switches — server value is authoritative on reopen.
  useEffect(() => {
    if (!open) setOptimisticCooldown(null);
  }, [open, counterparty?.userId]);

  const settle = trpc.expenseShare.settleAllWithUser.useMutation({
    onSuccess: () => {
      hapticFeedback.notificationOccurred.ifAvailable("success");
      onAfterMutate();
      onOpenChange(false);
    },
    onError: (e) => {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      showSnackbar(`Failed to settle: ${e.message}`);
    },
  });

  const nudge = trpc.expenseShare.nudgeCounterparty.useMutation({
    onSuccess: (data) => {
      hapticFeedback.notificationOccurred.ifAvailable("success");
      showSnackbar("Reminder sent 👋");
      setOptimisticCooldown(data.nudgeCooldownUntil);
    },
    onError: (e) => {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      showSnackbar(e.message ?? "Nudge failed");
    },
  });

  const isOwedToUser = (counterparty?.totalBaseNet ?? 0) > 0;
  const isDebtor = !!counterparty && !isOwedToUser; // caller owes counterparty
  const canNudge = !!counterparty && isOwedToUser && counterparty.hasStartedBot;
  const cooldownRemainingMs =
    cooldownUntil && cooldownUntil > Date.now()
      ? cooldownUntil - Date.now()
      : 0;
  const isCoolingDown = cooldownRemainingMs > 0;

  // Group buckets by chatId — one breakdown cell per chat with currencies
  // stacked right-aligned underneath (receipt-style).
  const byChat = useMemo(() => {
    if (!counterparty) return [];
    const m = new Map<
      number,
      { chatId: number; chatTitle: string; currencies: Group[] }
    >();
    for (const g of counterparty.groups) {
      const entry = m.get(g.chatId);
      if (entry) {
        entry.currencies.push(g);
      } else {
        m.set(g.chatId, {
          chatId: g.chatId,
          chatTitle: g.chatTitle,
          currencies: [g],
        });
      }
    }
    return Array.from(m.values());
  }, [counterparty]);

  // Phone lookup for PayNow QR + Copy Phone No. (only used in debtor direction)
  const { data: counterpartyUser } = trpc.user.getUser.useQuery(
    { userId: counterparty?.userId ?? 0 },
    { enabled: open && isDebtor }
  );
  const counterpartyPhone = counterpartyUser?.phoneNumber ?? null;

  // Native button loading state is driven by a useEffect that mirrors
  // the mutation's isPending — see below. Handlers just kick off the
  // mutation; haptic + snackbar are handled by mutation callbacks.
  const handleSettle = useCallback(() => {
    if (!counterparty) return;
    settle.mutate({ counterpartyUserId: counterparty.userId });
  }, [counterparty, settle]);

  const handleNudge = useCallback(() => {
    if (!counterparty) return;
    hapticFeedback.impactOccurred.ifAvailable("light");
    nudge.mutate({ counterpartyUserId: counterparty.userId });
  }, [counterparty, nudge]);

  const handleCopyPhone = useCallback(async () => {
    if (!counterpartyPhone) return;
    hapticFeedback.impactOccurred.ifAvailable("light");
    try {
      await navigator.clipboard.writeText(counterpartyPhone);
      hapticFeedback.notificationOccurred.ifAvailable("success");
      showSnackbar("Phone number copied 📲");
    } catch {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      showSnackbar("Failed to copy number");
    }
  }, [counterpartyPhone, showSnackbar]);

  // mainButton — Settle All ✅; loader + disabled mirror settle.isPending
  useEffect(() => {
    if (!open || !counterparty) return;
    mainButton.setParams.ifAvailable({
      isVisible: true,
      isEnabled: !settle.isPending,
      isLoaderVisible: settle.isPending,
      text: "Settle All ✅",
    });
    return () =>
      mainButton.setParams.ifAvailable({
        isVisible: false,
        isLoaderVisible: false,
      });
  }, [open, counterparty, settle.isPending]);

  useEffect(() => {
    if (!open || !counterparty) return;
    const off = mainButton.onClick.ifAvailable(handleSettle);
    return () => off?.();
  }, [open, counterparty, handleSettle]);

  // secondaryButton — direction-dependent:
  //   debtor (user owes) + counterparty has phone → "Copy Phone No. 📲"
  //   creditor (user is owed) + counterparty started bot → "Nudge 👋"
  const showCopyPhone = !!(open && isDebtor && counterpartyPhone);
  const showNudge = !!(open && canNudge);

  useEffect(() => {
    if (showCopyPhone) {
      secondaryButton.setParams.ifAvailable({
        isVisible: true,
        isEnabled: true,
        isLoaderVisible: false,
        text: "Copy Phone No. 📲",
      });
    } else if (showNudge) {
      const text = isCoolingDown
        ? `Nudge again in ${formatCountdown(cooldownRemainingMs)}`
        : "Nudge 👋";
      secondaryButton.setParams.ifAvailable({
        isVisible: true,
        isEnabled: !nudge.isPending && !isCoolingDown,
        isLoaderVisible: nudge.isPending,
        text,
      });
    }
    return () =>
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
        isLoaderVisible: false,
      });
  }, [
    showCopyPhone,
    showNudge,
    nudge.isPending,
    isCoolingDown,
    cooldownRemainingMs,
  ]);

  useEffect(() => {
    if (showCopyPhone) {
      const off = secondaryButton.onClick.ifAvailable(handleCopyPhone);
      return () => off?.();
    }
    if (showNudge) {
      const off = secondaryButton.onClick.ifAvailable(handleNudge);
      return () => off?.();
    }
  }, [showCopyPhone, showNudge, handleCopyPhone, handleNudge]);

  if (!counterparty) {
    return (
      <Modal open={open} onOpenChange={onOpenChange}>
        <div />
      </Modal>
    );
  }

  const fullName = [counterparty.firstName, counterparty.lastName]
    .filter(Boolean)
    .join(" ");
  const subhead = isDebtor ? "You owe" : `${counterparty.firstName} owes`;
  const body = isDebtor ? fullName : "You";
  const totalBaseAbs = Math.abs(counterparty.totalBaseNet);
  const showQr =
    isDebtor &&
    !!counterpartyPhone &&
    baseCurrency === "SGD" &&
    totalBaseAbs > 0;

  return (
    <Modal
      header={<Modal.Header>Settle Debts?</Modal.Header>}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex max-h-[70vh] min-h-40 flex-col gap-y-2 pb-8 pt-px">
        <Section className="pe-2">
          <Cell
            before={<ChatMemberAvatar userId={counterparty.userId} size={48} />}
            subhead={subhead}
            after={
              <Info type="text" subtitle="Total">
                <Text
                  weight="2"
                  className={cn(
                    getBalanceColorClass(counterparty.totalBaseNet)
                  )}
                >
                  {formatCurrencyWithCode(
                    Math.abs(counterparty.totalBaseNet),
                    baseCurrency
                  )}
                </Text>
              </Info>
            }
          >
            {body}
          </Cell>
        </Section>

        <Section header="Breakdown">
          {byChat.map((chat) => (
            <Cell
              key={chat.chatId}
              after={
                <div className="flex flex-col items-end gap-0.5">
                  {chat.currencies.map((c) => (
                    <div
                      key={c.currency}
                      className="flex flex-col items-end gap-0.5"
                    >
                      <div className="flex items-center gap-x-1">
                        <span className="text-base">
                          {currencyMap.get(c.currency)?.flagEmoji ?? "🌍"}
                        </span>
                        <Text className={cn(getBalanceColorClass(c.nativeNet))}>
                          {c.nativeNet >= 0 ? "+ " : "− "}
                          {formatCurrencyWithCode(
                            Math.abs(c.nativeNet),
                            c.currency
                          )}
                        </Text>
                      </div>
                      {c.currency !== baseCurrency && (
                        <Caption style={{ color: tSubtitleColor }}>
                          or{" "}
                          {formatCurrencyWithCode(
                            Math.abs(c.baseNet),
                            baseCurrency
                          )}
                        </Caption>
                      )}
                    </div>
                  ))}
                </div>
              }
            >
              {chat.chatTitle}
            </Cell>
          ))}
        </Section>

        {showQr && counterpartyPhone && (
          <div className="mt-4">
            <PayNowQR
              phoneNumber={counterpartyPhone}
              amount={totalBaseAbs}
              merchantName={counterparty.firstName}
            />
          </div>
        )}

        {snackbar && (
          <Snackbar duration={3000} onClose={() => setSnackbar(null)}>
            {snackbar.text}
          </Snackbar>
        )}
      </div>
    </Modal>
  );
}
