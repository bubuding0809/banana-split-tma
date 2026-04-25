import { Caption, Cell, Info, Skeleton } from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { format } from "date-fns";

import { trpc } from "@utils/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";
import {
  nextOccurrenceAfter,
  PRESET_LABEL,
  UNIT_SINGULAR,
  type CanonicalFrequency,
  type Weekday,
} from "./recurrencePresets";

export interface RecurringTemplateForCell {
  id: string;
  description: string;
  amount: string | number;
  currency: string;
  payerId: number;
  chatId: number;
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  startDate: Date | string;
  endDate: Date | string | null;
  categoryId: string | null;
}

interface Props {
  template: RecurringTemplateForCell;
  categoryEmoji?: string;
  onClick?: () => void;
}

export default function RecurringExpenseCell({
  template,
  categoryEmoji,
  onClick,
}: Props) {
  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  const userId = tUserData?.id ?? 0;

  const { data: member, isLoading: isMemberLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId: template.chatId,
      userId: template.payerId,
    });

  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  const isPayerYou = template.payerId === userId;
  const memberFullName = isPayerYou
    ? "You"
    : `${member?.user.first_name ?? ""}${
        member?.user.last_name ? ` ${member.user.last_name}` : ""
      }`;

  // Compute the next fire date using the same helper the form uses.
  // When interval > 1 and frequency=WEEKLY, this matches the Lambda's
  // skip filter — what users see on the cell is what AWS will fire.
  const startDate =
    template.startDate instanceof Date
      ? template.startDate
      : new Date(template.startDate);
  const nextFire = nextOccurrenceAfter(startDate, {
    frequency: template.frequency,
    interval: template.interval,
    weekdays: template.weekdays,
  });

  // Frequency badge text — "Daily", "Weekly", etc., except for non-1
  // intervals which read more naturally as "Every N <unit>".
  const freqLabel =
    template.interval === 1
      ? PRESET_LABEL[template.frequency]
      : `Every ${template.interval} ${UNIT_SINGULAR[template.frequency]}s`;

  const flagEmoji =
    supportedCurrencies?.find((c) => c.code === template.currency)?.flagEmoji ??
    "💱";

  const handleClick = () => {
    hapticFeedback.selectionChanged();
    onClick?.();
  };

  return (
    <Cell
      onClick={handleClick}
      before={
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-xl leading-none">
          {categoryEmoji ?? "❓"}
        </div>
      }
      subhead={
        <Skeleton visible={isMemberLoading}>
          <Caption
            weight="1"
            level="1"
            style={{ color: isPayerYou ? tButtonColor : undefined }}
          >
            {isPayerYou ? "You" : memberFullName} spends
          </Caption>
        </Skeleton>
      }
      description={
        <Caption weight="1" level="1" style={{ color: tSubtitleTextColor }}>
          on{" "}
          <Caption weight="2" level="1">
            {template.description}
          </Caption>
        </Caption>
      }
      after={
        <Info
          avatarStack={
            <Info type="text">
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-(--tg-theme-link-color) rounded-full bg-[color-mix(in_srgb,var(--tg-theme-link-color)_18%,transparent)] px-2 py-0.5 text-[10px] font-semibold">
                  ↻ {freqLabel}
                </span>
                <Caption className="w-max" weight="2">
                  Next {format(nextFire, "d MMM")}
                </Caption>
              </div>
            </Info>
          }
          type="avatarStack"
        />
      }
    >
      <span className="flex items-center gap-1">
        {flagEmoji}{" "}
        {formatCurrencyWithCode(Number(template.amount), template.currency)}
      </span>
    </Cell>
  );
}
