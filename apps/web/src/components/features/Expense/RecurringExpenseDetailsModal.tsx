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
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Calendar as CalendarIcon,
  Pencil,
  Repeat as RepeatIcon,
  X,
} from "lucide-react";
import { trpc } from "@utils/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import ShareParticipant from "../Chat/ShareParticipant";
import { formatCurrencyWithCode } from "@/utils/financial";
import { formatExpenseDate } from "@utils/date";
import {
  formatRecurrenceSummary,
  PRESET_LABEL,
  type CanonicalFrequency,
  type Weekday,
} from "./recurrencePresets";

const splitModeMap = {
  EQUAL: "Split equally",
  PERCENTAGE: "Split by percentage",
  EXACT: "Split exactly",
  SHARES: "Split by shares",
} as const;

type SplitMode = keyof typeof splitModeMap;

export interface RecurringTemplateForModal {
  id: string;
  chatId: number;
  payerId: number;
  description: string;
  amount: string | number;
  currency: string;
  splitMode: SplitMode;
  participantIds: number[];
  customSplits: unknown;
  categoryId: string | null;
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  startDate: Date | string;
  endDate: Date | string | null;
  timezone: string;
  status: "ACTIVE" | "CANCELED" | "ENDED";
}

export interface ShareForModal {
  userId: number;
  amount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: RecurringTemplateForModal;
  shares: ShareForModal[];
  userId: number;
  categoryEmoji?: string;
  categoryTitle?: string;
  onEdit: () => void;
}

export default function RecurringExpenseDetailsModal({
  open,
  onOpenChange,
  template,
  shares,
  userId,
  categoryEmoji,
  categoryTitle,
  onEdit,
}: Props) {
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  // Coerce to Number — Prisma keeps Telegram IDs as bigint, which crashes
  // tRPC's queryKey hashing ("JSON.stringify cannot serialize BigInt").
  const chatIdNum = Number(template.chatId);
  const payerIdNum = Number(template.payerId);

  const { data: member, isLoading: isMemberLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId: chatIdNum,
      userId: payerIdNum,
    });

  const isPayerYou = payerIdNum === userId;
  const memberFullName = isPayerYou
    ? "You"
    : `${member?.user.first_name ?? ""}${
        member?.user.last_name ? ` ${member.user.last_name}` : ""
      }`;

  const startDate =
    template.startDate instanceof Date
      ? template.startDate
      : new Date(template.startDate);
  const endDate = template.endDate
    ? template.endDate instanceof Date
      ? template.endDate
      : new Date(template.endDate)
    : null;

  const repeatSummary = formatRecurrenceSummary({
    frequency: template.frequency,
    interval: template.interval,
    weekdays: template.weekdays,
    endDate: null,
  });
  // Short label for the Repeat row's after-slot. WEEKLY with picked
  // weekdays and CUSTOM (interval > 1) need the full summary too —
  // rendered as a separate multiline cell below so the long string
  // doesn't wrap inside the after slot.
  const repeatShortLabel =
    template.interval === 1 ? PRESET_LABEL[template.frequency] : "Custom";
  const showRepeatSummaryRow =
    repeatSummary !== repeatShortLabel &&
    (template.frequency === "WEEKLY" || template.interval > 1);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title level="3" weight="1">
              Recurring
            </Title>
          }
          after={
            <div className="flex items-center gap-2">
              <IconButton
                size="s"
                mode="gray"
                onClick={onEdit}
                aria-label="Edit recurring template"
                className="p-1"
              >
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
                    style={{ color: tSubtitleTextColor }}
                  />
                </IconButton>
              </Modal.Close>
            </div>
          }
        >
          <Badge type="number" mode="secondary" className="text-blue-400">
            <Caption weight="2" className="text-blue-400">
              ↻ {repeatShortLabel}
            </Caption>
          </Badge>
        </Modal.Header>
      }
    >
      <div className="flex max-h-[70vh] flex-col overflow-y-auto pb-5">
        {/* What was this for? */}
        <Section header="What was this for?" className="px-3">
          <Cell
            style={{ backgroundColor: tSectionBgColor }}
            before={
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-lg leading-none">
                {categoryEmoji ?? "❓"}
              </div>
            }
            subtitle={<Caption>{categoryTitle ?? "Uncategorized"}</Caption>}
          >
            <Text className="text-wrap">{template.description}</Text>
          </Cell>
        </Section>

        {/* Who paid for this? */}
        <Section header="Who paid for this?" className="px-3">
          <Cell
            before={<ChatMemberAvatar userId={payerIdNum} size={48} />}
            subtitle={
              <Skeleton visible={isMemberLoading}>
                <Caption>Started {formatExpenseDate(startDate)}</Caption>
              </Skeleton>
            }
            after={
              <Info subtitle="Per fire" type="text">
                <Text weight="2">
                  {formatCurrencyWithCode(
                    Number(template.amount),
                    template.currency
                  )}
                </Text>
              </Info>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Skeleton visible={isMemberLoading}>
              <Text
                weight="2"
                style={{ color: isPayerYou ? tButtonColor : "inherit" }}
              >
                {memberFullName} spends
              </Text>
            </Skeleton>
          </Cell>
        </Section>

        {/* Split amounts — omitted when shares list is empty */}
        {shares.length > 0 && (
          <Section header="Split amounts" className="px-3">
            {[...shares]
              .sort((a, b) => {
                if (a.userId === userId) return -1;
                if (b.userId === userId) return 1;
                return 0;
              })
              .map((share) => (
                <ShareParticipant
                  key={share.userId}
                  chatId={chatIdNum}
                  userId={share.userId}
                  amount={share.amount}
                  currency={template.currency}
                  isCurrentUser={share.userId === userId}
                />
              ))}
          </Section>
        )}

        {/* How is this expense split? */}
        <Section className="px-3" header="How is this expense split?">
          <Cell
            after={
              <Text className="text-gray-400">
                {splitModeMap[template.splitMode]}
              </Text>
            }
            style={{ backgroundColor: tSectionBgColor }}
          >
            <Text weight="2">Split Method</Text>
          </Cell>
        </Section>

        {/* Schedule — same shape used in the augmented ExpenseDetailsModal.
            Two-cell pattern (short label + multiline summary) matches the
            form so long summaries like "Weekly on Sat, Tue, Sun, Mon, Wed"
            don't wrap inside the Repeat cell's after slot. */}
        <Section className="px-3" header="Schedule">
          <Cell
            before={
              <RepeatIcon size={20} style={{ color: tSubtitleTextColor }} />
            }
            after={
              <Text style={{ color: tSubtitleTextColor }}>
                {repeatShortLabel}
              </Text>
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
      </div>
    </Modal>
  );
}
