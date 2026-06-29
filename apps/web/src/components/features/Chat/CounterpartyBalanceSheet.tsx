import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Caption,
  Cell,
  Info,
  Modal,
  Navigation,
  Section,
  Snackbar,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  initData,
  mainButton,
  secondaryButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { MoveDebtSheet } from "./MoveDebtSheet";
import { deriveMoveParams, type MoveParams } from "./deriveMoveParams";
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

// HH:MM:SS clock — used for the live countdown on the secondary button.
function formatHms(remainingMs: number): string {
  if (remainingMs <= 0) return "00:00:00";
  const totalSec = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Friendlier hours-and-minutes phrasing for the cooldown snackbar.
function formatHumanHm(remainingMs: number): string {
  if (remainingMs <= 0) return "0 minutes";
  const totalMin = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
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
  const tSecondaryBgColor = useSignal(themeParams.secondaryBackgroundColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tUser = useSignal(initData.user);
  const callerId = Number(tUser?.id ?? 0);
  const [moveTarget, setMoveTarget] = useState<MoveParams | null>(null);
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
    if (!cooldownUntil || cooldownUntil <= Date.now()) return;
    const id = setInterval(() => {
      const now = Date.now();
      if (now >= cooldownUntil) {
        clearInterval(id);
        setNow(now); // final re-render flips button back to ready state
        return;
      }
      setNow(now);
    }, 1000);
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
    // Mid-cooldown taps explain the wait via snackbar instead of
    // firing the mutation (which would 429 anyway).
    if (cooldownUntil && cooldownUntil > Date.now()) {
      hapticFeedback.notificationOccurred.ifAvailable("warning");
      const remaining = cooldownUntil - Date.now();
      showSnackbar(`Already nudged · try again in ${formatHumanHm(remaining)}`);
      return;
    }
    hapticFeedback.impactOccurred.ifAvailable("light");
    nudge.mutate({ counterpartyUserId: counterparty.userId });
  }, [counterparty, nudge, cooldownUntil, showSnackbar]);

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

  // The nested MoveDebtSheet owns the native buttons while it is open, so
  // suppress this sheet's Settle/Nudge buttons whenever a move is in progress.
  const moveSheetOpen = moveTarget !== null;

  // mainButton — Settle All ✅; loader + disabled mirror settle.isPending
  useEffect(() => {
    if (!open || !counterparty || moveSheetOpen) return;
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
  }, [open, counterparty, settle.isPending, moveSheetOpen]);

  useEffect(() => {
    if (!open || !counterparty || moveSheetOpen) return;
    const off = mainButton.onClick.ifAvailable(handleSettle);
    return () => off?.();
  }, [open, counterparty, handleSettle, moveSheetOpen]);

  // secondaryButton — direction-dependent:
  //   debtor (user owes) + counterparty has phone → "Copy Phone No. 📲"
  //   creditor (user is owed) + counterparty started bot → "Nudge 👋"
  const showCopyPhone = !!(
    open &&
    !moveSheetOpen &&
    isDebtor &&
    counterpartyPhone
  );
  const showNudge = !!(open && !moveSheetOpen && canNudge);

  // Visibility / enabled / colour / pending — only fires on the
  // booleans + theme signals that actually change those flags.
  // cooldownRemainingMs is intentionally NOT in the deps so the 1Hz
  // countdown tick doesn't bounce the button (cleanup → re-show
  // flicker). The countdown text is updated imperatively below.
  //
  // During cooldown: button stays ENABLED (so the user can tap and
  // see the explanatory snackbar) but renders with muted theme colours
  // to read as "not active". handleNudge gates on cooldown and
  // short-circuits to the snackbar instead of mutating.
  useEffect(() => {
    if (showCopyPhone) {
      secondaryButton.setParams.ifAvailable({
        isVisible: true,
        isEnabled: true,
        isLoaderVisible: false,
        text: "Copy Phone No. 📲",
      });
    } else if (showNudge) {
      secondaryButton.setParams.ifAvailable({
        isVisible: true,
        isEnabled: !nudge.isPending,
        isLoaderVisible: nudge.isPending,
        text: isCoolingDown
          ? `⏳ ${formatHms(cooldownRemainingMs)}`
          : "Nudge 👋",
        // Always pass colours — setParams is a patch and omitted keys
        // stick at their previous value, so the cooldown→ready
        // transition needs the explicit reset to default button theme.
        backgroundColor: (isCoolingDown ? tSecondaryBgColor : tButtonColor) as
          | `#${string}`
          | undefined,
        textColor: (isCoolingDown ? tSubtitleColor : tButtonTextColor) as
          | `#${string}`
          | undefined,
      });
    }
    return () =>
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
        isLoaderVisible: false,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showCopyPhone,
    showNudge,
    nudge.isPending,
    isCoolingDown,
    tSecondaryBgColor,
    tSubtitleColor,
    tButtonColor,
    tButtonTextColor,
  ]);

  // Live text-only tick while cooling down. Imperative — never runs
  // the visibility cleanup, so no flicker.
  useEffect(() => {
    if (!showNudge || !isCoolingDown) return;
    secondaryButton.setParams.ifAvailable({
      text: `⏳ ${formatHms(cooldownRemainingMs)}`,
    });
  }, [showNudge, isCoolingDown, cooldownRemainingMs]);

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
          {byChat.flatMap((chat) =>
            chat.currencies.map((c) => {
              const params = deriveMoveParams(
                {
                  chatId: c.chatId,
                  chatTitle: c.chatTitle,
                  currency: c.currency,
                  nativeNet: c.nativeNet,
                },
                callerId,
                counterparty.userId
              );
              const canMove = params !== null;
              return (
                <Cell
                  key={`${chat.chatId}-${c.currency}`}
                  onClick={
                    canMove
                      ? () => {
                          hapticFeedback.impactOccurred.ifAvailable("light");
                          setMoveTarget(params);
                        }
                      : undefined
                  }
                  after={
                    <div className="flex items-center gap-x-1.5">
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-x-1">
                          <span className="text-base">
                            {currencyMap.get(c.currency)?.flagEmoji ?? "🌍"}
                          </span>
                          <Text
                            className={cn(getBalanceColorClass(c.nativeNet))}
                          >
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
                      {canMove && <Navigation />}
                    </div>
                  }
                >
                  {chat.chatTitle}
                </Cell>
              );
            })
          )}
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
      <MoveDebtSheet
        open={moveTarget !== null}
        move={moveTarget}
        counterpartyUserId={counterparty.userId}
        counterpartyName={counterparty.firstName}
        onOpenChange={(o) => !o && setMoveTarget(null)}
        onAfterMutate={onAfterMutate}
      />
    </Modal>
  );
}
