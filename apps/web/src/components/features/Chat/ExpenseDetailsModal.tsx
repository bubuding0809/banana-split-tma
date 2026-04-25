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

import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { formatExpenseDate } from "@utils/date";
import { useMemo } from "react";
import { formatCurrencyWithCode } from "@/utils/financial";
import {
  Calendar as CalendarIcon,
  Repeat as RepeatIcon,
  X,
  Pencil,
} from "lucide-react";
import { trpc } from "@utils/trpc";
import {
  formatRecurrenceSummary,
  PRESET_LABEL,
  type CanonicalFrequency,
  type Weekday,
} from "@/components/features/Expense/recurrencePresets";
import ShareParticipant from "./ShareParticipant";

const splitModeMap = {
  EQUAL: "Split equally",
  PERCENTAGE: "Split by percentage",
  EXACT: "Split exactly",
  SHARES: "Split by shares",
} as const;

interface RecurringScheduleSectionProps {
  templateId: string;
  tSectionBgColor: string | undefined;
  tSubtitleTextColor: string | undefined;
}

const RecurringScheduleSection = ({
  templateId,
  tSectionBgColor,
  tSubtitleTextColor,
}: RecurringScheduleSectionProps) => {
  const { data: template } = trpc.expense.recurring.get.useQuery(
    { templateId },
    { enabled: Boolean(templateId) }
  );

  if (!template) return null;

  const t = template as {
    frequency: CanonicalFrequency;
    interval: number;
    weekdays: Weekday[];
    endDate: Date | string | null;
  };

  const repeatSummary = formatRecurrenceSummary({
    frequency: t.frequency,
    interval: t.interval,
    weekdays: t.weekdays,
    endDate: null,
  });
  // Two-cell pattern matching the recurring detail modal + form: short
  // label on the Repeat row, long descriptive summary as a multiline cell
  // below when applicable. Avoids ugly wrapping in the after-slot.
  const repeatShortLabel =
    t.interval === 1 ? PRESET_LABEL[t.frequency] : "Custom";
  const showRepeatSummaryRow =
    repeatSummary !== repeatShortLabel &&
    (t.frequency === "WEEKLY" || t.interval > 1);
  const endDate = t.endDate
    ? t.endDate instanceof Date
      ? t.endDate
      : new Date(t.endDate)
    : null;

  return (
    <Section className="px-3" header="Schedule">
      <Cell
        before={<RepeatIcon size={20} style={{ color: tSubtitleTextColor }} />}
        after={
          <Text style={{ color: tSubtitleTextColor }}>{repeatShortLabel}</Text>
        }
        style={{ backgroundColor: tSectionBgColor }}
      >
        <Text weight="2">Repeat</Text>
      </Cell>
      {showRepeatSummaryRow && (
        // After slot — Cell wraps body children in a <span> so a
        // `w-full text-right` div there can't actually fill width or
        // right-align. The after slot is positioned by telegram-ui itself.
        <Cell
          after={
            <Text
              className="text-sm"
              style={{
                color: tSubtitleTextColor,
                whiteSpace: "normal",
              }}
            >
              {repeatSummary}
            </Text>
          }
          style={{ backgroundColor: tSectionBgColor }}
        />
      )}
      <Cell
        before={
          <CalendarIcon size={20} style={{ color: tSubtitleTextColor }} />
        }
        after={
          <Text style={{ color: tSubtitleTextColor }}>
            {endDate ? formatExpenseDate(endDate) : "Never"}
          </Text>
        }
        style={{ backgroundColor: tSectionBgColor }}
      >
        <Text weight="2">End Date</Text>
      </Cell>
    </Section>
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
  userId: number;
  onEdit: () => void;
  categoryEmoji?: string;
  categoryTitle?: string;
}

const ExpenseDetailsModal = ({
  open,
  onOpenChange,
  expense,
  member,
  isMemberLoading,
  expenseDetails,
  userId,
  onEdit,
  categoryEmoji,
  categoryTitle,
}: ExpenseDetailsModalProps) => {
  //* hooks ========================================================================================
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  const isPayerYou = Number(expense.payerId) === Number(userId);
  const memberFullName = isPayerYou
    ? "You"
    : `${member?.user.first_name}${
        member?.user.last_name ? ` ${member.user.last_name}` : ""
      }`;

  // Determine the relation of the user to the expense (payer, borrower, unrelated)
  const expenseRelation = useMemo(() => {
    const payerIsYou = expense.payerId === userId;
    const isUnrelated =
      !payerIsYou &&
      !expenseDetails?.shares.some((share) => share.userId === userId);

    switch (true) {
      case payerIsYou:
        return "payer";
      case isUnrelated:
        return "unrelated";
      default:
        return "borrower";
    }
  }, [expenseDetails?.shares, expense.payerId, userId]);

  // Amount borrowed for this expense
  const borrowedAmount = useMemo(() => {
    if (expenseRelation !== "borrower") return 0;
    return (
      expenseDetails?.shares.reduce((acc, share) => {
        const isCreditor = share.userId === userId;
        if (isCreditor) return acc + share.amount;
        return acc;
      }, 0) ?? 0
    );
  }, [userId, expenseDetails, expenseRelation]);

  // Amount lent for this expense
  const lentAmount = useMemo(() => {
    if (expenseRelation !== "payer") return 0;
    return (
      expenseDetails?.shares.reduce((acc, share) => {
        const isDebtor = share.userId !== userId;
        if (isDebtor) return acc + share.amount;
        return acc;
      }, 0) ?? 0
    );
  }, [expenseRelation, expenseDetails?.shares, userId]);

  //* Handlers =====================================================================================
  const getSubtitle = () => {
    switch (expenseRelation) {
      case "unrelated":
        return "🤷‍♂️ Not involved";
      case "borrower":
        return `🚨 You owe $${borrowedAmount.toFixed(2)}`;
      case "payer":
        return lentAmount === 0
          ? "✅ Even"
          : `💸 You're owed $${lentAmount.toFixed(2)}`;
      default:
        return "";
    }
  };

  const getSubtitleColor = () => {
    switch (expenseRelation) {
      case "unrelated":
        return "text-zinc-500";
      case "borrower":
        return "text-red-500";
      case "payer":
        return lentAmount === 0 ? "text-zinc-500" : "text-green-500";
      default:
        return "text-zinc-500";
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title level="3" weight="1">
              Expense
            </Title>
          }
          after={
            <div className="flex items-center gap-2">
              <IconButton size="s" mode="gray" onClick={onEdit} className="p-1">
                <Pencil
                  size={20}
                  strokeWidth={3}
                  style={{ color: tButtonColor }}
                />
              </IconButton>
              <Modal.Close>
                <IconButton
                  size="s"
                  mode="gray"
                  onClick={() => hapticFeedback.impactOccurred("light")}
                >
                  <X
                    size={20}
                    strokeWidth={3}
                    style={{
                      color: tSubtitleTextColor,
                    }}
                  />
                </IconButton>
              </Modal.Close>
            </div>
          }
        >
          <Badge type="number" mode="secondary" className={getSubtitleColor()}>
            <Caption weight="2" className={getSubtitleColor()}>
              {getSubtitle()}
            </Caption>
          </Badge>
        </Modal.Header>
      }
    >
      <div className="flex max-h-[70vh] flex-col overflow-y-auto pb-5">
        {/* Description */}
        <Section header="What was this for?" className="px-3">
          <Cell
            style={{
              backgroundColor: tSectionBgColor,
            }}
            before={
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-lg leading-none">
                {categoryEmoji ?? "❓"}
              </div>
            }
            subtitle={<Caption>{categoryTitle ?? "Uncategorized"}</Caption>}
          >
            <Text className="text-wrap">{expense.description}</Text>
          </Cell>
        </Section>

        {/* Overview */}
        <Section header="Who paid for this?" className="px-3">
          <Cell
            before={<ChatMemberAvatar userId={expense.payerId} size={48} />}
            subtitle={
              <Skeleton visible={isMemberLoading}>
                <Caption>{formatExpenseDate(new Date(expense.date))}</Caption>
              </Skeleton>
            }
            after={
              <Info subtitle="Total" type="text">
                <Text weight="2">
                  {formatCurrencyWithCode(expense.amount, expense.currency)}
                </Text>
              </Info>
            }
            style={{
              backgroundColor: tSectionBgColor,
            }}
          >
            <Skeleton visible={isMemberLoading}>
              <Text
                weight="2"
                style={{
                  color: isPayerYou ? tButtonColor : "inherit",
                }}
              >
                {memberFullName} spent
              </Text>
            </Skeleton>
          </Cell>
        </Section>

        {/* Split Details Section */}
        {expenseDetails?.shares && expenseDetails.shares.length > 0 && (
          <Section header="Split amounts" className="px-3">
            {expenseDetails.shares
              .sort((a, b) => {
                // Move current user to front
                if (a.userId === userId) return -1;
                if (b.userId === userId) return 1;
                return 0;
              })
              .map((share) => (
                <ShareParticipant
                  key={share.userId}
                  chatId={expense.chatId}
                  userId={share.userId}
                  amount={share.amount}
                  currency={expense.currency}
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

        {/* Schedule (only when this expense was created by a recurring
            template). Same shape as the Schedule section in
            RecurringExpenseDetailsModal so users see one design across
            both places. */}
        {expense.recurringTemplateId && (
          <RecurringScheduleSection
            templateId={expense.recurringTemplateId}
            tSectionBgColor={tSectionBgColor}
            tSubtitleTextColor={tSubtitleTextColor}
          />
        )}
      </div>
    </Modal>
  );
};

export default ExpenseDetailsModal;
