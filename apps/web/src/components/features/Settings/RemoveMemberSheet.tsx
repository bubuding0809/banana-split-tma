import { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Button,
  IconButton,
  Modal,
  Spinner,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import { ArrowRight, X } from "lucide-react";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { trpc } from "@/utils/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";

interface MemberSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
}

interface RemoveMemberSheetProps {
  chatId: number;
  member: MemberSummary | null;
  isYou: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: (member: MemberSummary, isYou: boolean) => void;
}

interface StepDef {
  label: string;
  description: ReactNode;
  mockup?: ReactNode;
}

function fullName(m: MemberSummary) {
  return [m.firstName, m.lastName].filter(Boolean).join(" ");
}

export default function RemoveMemberSheet({
  chatId,
  member,
  isYou,
  onOpenChange,
  onRemoved,
}: RemoveMemberSheetProps) {
  const navigate = useNavigate();
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tDestructiveTextColor = useSignal(themeParams.destructiveTextColor);
  const tSecondaryBgColor = useSignal(themeParams.secondaryBackgroundColor);

  const open = member !== null;
  const userId = member ? Number(member.id) : null;

  const trpcUtils = trpc.useUtils();
  const balanceQuery = trpc.chat.getMemberBalanceSummary.useQuery(
    { chatId, userId: userId ?? 0 },
    { enabled: open && userId !== null, refetchOnWindowFocus: false }
  );

  const removeMutation = trpc.chat.removeMember.useMutation({
    onSuccess: async () => {
      hapticFeedback.notificationOccurred("success");
      if (!member) return;
      // Optimistically prune the member list for the chat
      trpcUtils.chat.listMembers.setData({ chatId }, (prev) =>
        prev ? prev.filter((m) => m.id !== member.id) : prev
      );
      // Invalidate balance/summary views that may reference the removed member
      await Promise.all([
        trpcUtils.chat.listMembers.invalidate({ chatId }),
        trpcUtils.chat.getDebtorsMultiCurrency.invalidate({ chatId }),
        trpcUtils.chat.getCreditorsMultiCurrency.invalidate({ chatId }),
        trpcUtils.chat.getSimplifiedDebtsMultiCurrency.invalidate({ chatId }),
      ]);
      onRemoved(member, isYou);
    },
    onError: () => {
      hapticFeedback.notificationOccurred("error");
      // Refetch the summary so the sheet can flip to the blocked state if the
      // server rejected because of a balance change.
      balanceQuery.refetch();
    },
  });

  const handleClose = () => {
    if (removeMutation.isPending) return;
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (!member || !userId) return;
    hapticFeedback.impactOccurred("medium");
    removeMutation.mutate({ chatId, userId });
  };

  const handleSettleUp = () => {
    hapticFeedback.impactOccurred("light");
    onOpenChange(false);
    navigate({
      to: "/chat/$chatId",
      params: { chatId: String(chatId) },
      search: { selectedTab: "balance" },
    });
  };

  const cardStyle = { backgroundColor: tSecondaryBgColor };

  const STEPS: StepDef[] = [
    {
      label: "Past expenses stay",
      description:
        "Their name and share remain on every expense they were part of. History is preserved.",
      mockup: member ? (
        <div
          className="mt-3 rounded-lg border border-white/5 p-2"
          style={cardStyle}
        >
          <div className="flex items-center gap-2">
            <div className="bg-linear-to-br size-6 shrink-0 rounded-full from-orange-400 to-pink-500" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[11px] font-medium">
                Dinner at Tim&apos;s
              </div>
              <div className="text-[9px]" style={{ color: tSubtitleTextColor }}>
                Split with {fullName(member)} + 2 others
              </div>
            </div>
            <div className="text-[11px] font-semibold">$48.00</div>
          </div>
        </div>
      ) : undefined,
    },
    {
      label: "They stop counting forward",
      description:
        "New expenses won't include them. Future balances are calculated as if they aren't in the group.",
    },
    {
      label: "Re-add anytime",
      description:
        "Use Add Member to bring them back later. Their history reappears automatically.",
    },
  ];

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && removeMutation.isPending) return;
        onOpenChange(next);
      }}
      header={
        <Modal.Header
          before={
            <Title weight="2" level="3">
              {member ? `Remove ${member.firstName}?` : "Remove member"}
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
        />
      }
    >
      {member && (
        <div className="flex flex-col gap-5 px-4 pb-6 pt-2">
          {/* Hero — avatar + name */}
          <div className="flex flex-col items-center gap-1 pt-1">
            <ChatMemberAvatar userId={Number(member.id)} size={48} />
            <div className="mt-1 text-base font-semibold">
              {fullName(member)}
            </div>
            {member.username && (
              <div className="text-sm" style={{ color: tSubtitleTextColor }}>
                @{member.username}
              </div>
            )}
          </div>

          {balanceQuery.isPending ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="m" />
            </div>
          ) : balanceQuery.data && balanceQuery.data.balances.length > 0 ? (
            <BlockedState
              isYou={isYou}
              firstName={member.firstName}
              balances={balanceQuery.data.balances}
              onSettleUp={handleSettleUp}
              onClose={handleClose}
              destructiveColor={tDestructiveTextColor}
              cardStyle={cardStyle}
              subtitleColor={tSubtitleTextColor}
              accentColor={tButtonColor}
            />
          ) : (
            <ClearState
              isYou={isYou}
              steps={STEPS}
              onConfirm={handleConfirm}
              onClose={handleClose}
              loading={removeMutation.isPending}
              destructiveColor={tDestructiveTextColor}
              accentColor={tButtonColor}
              subtitleColor={tSubtitleTextColor}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

interface BlockedStateProps {
  isYou: boolean;
  firstName: string;
  balances: { currency: string; amount: number }[];
  onSettleUp: () => void;
  onClose: () => void;
  destructiveColor: string | undefined;
  cardStyle: React.CSSProperties;
  subtitleColor: string | undefined;
  accentColor: string | undefined;
}

function BlockedState({
  isYou,
  firstName,
  balances,
  onSettleUp,
  onClose,
  destructiveColor,
  cardStyle,
  subtitleColor,
  accentColor,
}: BlockedStateProps) {
  const subject = isYou ? "You" : firstName;
  const verbHas = isYou ? "have" : "has";

  return (
    <>
      <blockquote
        className="rounded-r-md border-l-[3px] py-1 pl-3"
        style={{ borderColor: destructiveColor ?? accentColor }}
      >
        <Text style={{ color: subtitleColor }}>
          {subject} {verbHas} outstanding balances in this group. Settle up
          before {isYou ? "leaving" : "removing them"}.
        </Text>
      </blockquote>

      <div className="flex flex-col gap-2">
        {balances.map((b) => {
          const owed = b.amount > 0; // positive = owed to them
          const label = owed
            ? `${isYou ? "You are" : `${firstName} is`} owed`
            : `${isYou ? "You owe" : `${firstName} owes`}`;
          return (
            <div
              key={b.currency}
              className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2"
              style={cardStyle}
            >
              <div className="text-[13px]" style={{ color: subtitleColor }}>
                {label}
              </div>
              <div
                className="text-[15px] font-semibold"
                style={{
                  color: owed ? undefined : destructiveColor,
                }}
              >
                {formatCurrencyWithCode(b.amount, b.currency)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          stretched
          size="l"
          mode="filled"
          onClick={onSettleUp}
          after={<ArrowRight size={20} strokeWidth={2.5} />}
        >
          Settle up first
        </Button>
        <Button stretched size="l" mode="plain" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </>
  );
}

interface ClearStateProps {
  isYou: boolean;
  steps: StepDef[];
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
  destructiveColor: string | undefined;
  accentColor: string | undefined;
  subtitleColor: string | undefined;
}

function ClearState({
  isYou,
  steps,
  onConfirm,
  onClose,
  loading,
  destructiveColor,
  accentColor,
  subtitleColor,
}: ClearStateProps) {
  return (
    <>
      <blockquote
        className="rounded-r-md border-l-[3px] py-1 pl-3"
        style={{ borderColor: accentColor }}
      >
        <Text style={{ color: subtitleColor }}>
          {isYou
            ? "Here's what happens when you leave the group."
            : "Here's what happens when you remove them."}
        </Text>
      </blockquote>

      <div className="px-2">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <div
              key={step.label}
              className={`relative pl-9 ${isLast ? "" : "pb-6"}`}
            >
              {!isLast && (
                <div
                  className="absolute bottom-0 left-[9px] top-6 w-[2px]"
                  style={{ backgroundColor: accentColor, opacity: 0.5 }}
                />
              )}
              <div
                className="absolute left-0 top-0.5 grid size-5 place-items-center rounded-full border-2"
                style={{ borderColor: accentColor }}
              >
                <div
                  className="size-2 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
              </div>
              <div className="text-[15px] font-medium leading-snug">
                {step.label}
              </div>
              <div
                className="mt-0.5 text-[13px] leading-snug"
                style={{ color: subtitleColor }}
              >
                {step.description}
              </div>
              {step.mockup}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          stretched
          size="l"
          mode="filled"
          loading={loading}
          disabled={loading}
          onClick={onConfirm}
          style={{
            backgroundColor: destructiveColor,
            color: "white",
          }}
        >
          {isYou ? "Leave group" : "Remove from group"}
        </Button>
        <Button
          stretched
          size="l"
          mode="plain"
          disabled={loading}
          onClick={onClose}
        >
          Cancel
        </Button>
      </div>
    </>
  );
}
