import { Cell, Text } from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { CalendarOff, Repeat as RepeatIcon, X } from "lucide-react";
import { useState } from "react";

import { formatExpenseDate } from "@utils/date";
import RecurrencePickerSheet, {
  type RecurrenceValue,
} from "./RecurrencePickerSheet";
import {
  presetToTemplate,
  PRESET_LABEL,
  splitRecurrenceSummary,
} from "./recurrencePresets";

export interface RepeatAndEndDateSectionProps {
  value: RecurrenceValue;
  onChange: (next: RecurrenceValue) => void;
  /**
   * The expense's transaction date (YYYY-MM-DD). Pre-fills the weekday
   * when the user taps Weekly / Custom in the picker, matches the
   * Apple-Reminders default behaviour. Also used as the `min` for the
   * native end-date input so users can't pick an end before the start.
   */
  defaultWeekdayFromDate?: string;
  /**
   * Called whenever the user touches Repeat or End Date — gives the
   * parent a chance to mark the field touched so cross-field validation
   * errors surface immediately. Optional: AddExpense uses it; the new
   * EditRecurring page does not (it manages its own dirty state).
   */
  onTouched?: () => void;
}

export default function RepeatAndEndDateSection({
  value,
  onChange,
  defaultWeekdayFromDate,
  onTouched,
}: RepeatAndEndDateSectionProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);

  const r = value;
  const shortLabel = r.preset === "NONE" ? "Never" : PRESET_LABEL[r.preset];

  // Secondary summary row — uses the two-slot pattern (left in Cell body,
  // right in Cell after) so the row reads as "Every | Sat, Tue, Sun..."
  // with the days right-aligned. Returns null for cases where the Repeat
  // row's short label already says everything (plain Daily / Monthly).
  const summary = (() => {
    if (r.preset === "NONE") return null;
    const t = presetToTemplate({
      preset: r.preset,
      customFrequency: r.customFrequency,
      customInterval: r.customInterval,
      weekdays: r.weekdays,
    });
    return splitRecurrenceSummary({
      frequency: t.frequency,
      interval: t.interval,
      weekdays: t.weekdays,
    });
  })();

  const openSheet = () => {
    hapticFeedback.impactOccurred("light");
    setRecurrenceOpen(true);
  };

  return (
    <div className="flex flex-col">
      <Cell
        before={<RepeatIcon size={24} style={{ color: tSubtitleTextColor }} />}
        after={
          <Text style={{ color: tSubtitleTextColor }}>{shortLabel} ›</Text>
        }
        onClick={openSheet}
      >
        Repeat
      </Cell>
      {summary && (
        // Body holds the left-anchored label ("Every" or "Every N weeks")
        // and the after slot holds the right-aligned value. telegram-ui
        // positions the after slot to the right via its own flex layout —
        // this is the only reliable way to right-align in a Cell because
        // body children get wrapped in an inline <span>.
        <Cell
          onClick={openSheet}
          after={
            <Text
              className="text-sm"
              style={{ color: tSubtitleTextColor, whiteSpace: "normal" }}
            >
              {summary.right}
            </Text>
          }
        >
          <Text className="text-sm" style={{ color: tSubtitleTextColor }}>
            {summary.left}
          </Text>
        </Cell>
      )}
      {r.preset !== "NONE" && (
        <Cell
          before={
            <CalendarOff size={24} style={{ color: tSubtitleTextColor }} />
          }
          after={
            r.endDate ? (
              <div className="flex items-center gap-2">
                <Text style={{ color: tSubtitleTextColor }}>
                  {formatExpenseDate(new Date(r.endDate + "T00:00:00"))}
                </Text>
                <span
                  role="button"
                  aria-label="Clear end date"
                  onPointerDown={(e) => {
                    // PointerDown stops the native date picker before it
                    // has a chance to open — onClick on the input fires
                    // too late on iOS Telegram, so the calendar pops even
                    // when we stopPropagation.
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    try {
                      hapticFeedback.selectionChanged();
                    } catch {
                      /* non-TMA */
                    }
                    onChange({ ...r, endDate: undefined });
                    onTouched?.();
                  }}
                  // Sits above the absolute date input (z-10) so taps land
                  // on the pill instead of the hidden file picker.
                  className="text-(--tg-theme-subtitle-text-color) relative z-20 flex size-6 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: "rgba(127, 127, 127, 0.25)",
                  }}
                >
                  <X size={14} />
                </span>
              </div>
            ) : (
              <Text style={{ color: tSubtitleTextColor }}>Never</Text>
            )
          }
          className="relative"
        >
          <input
            type="date"
            value={r.endDate ?? ""}
            min={defaultWeekdayFromDate || undefined}
            onChange={(e) => {
              hapticFeedback.impactOccurred("light");
              onChange({ ...r, endDate: e.target.value || undefined });
              onTouched?.();
            }}
            className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
          />
          End Date
        </Cell>
      )}
      <RecurrencePickerSheet
        open={recurrenceOpen}
        onOpenChange={setRecurrenceOpen}
        defaultWeekdayFromDate={defaultWeekdayFromDate}
        value={
          r.preset === "NONE"
            ? {
                preset: "NONE",
                customFrequency: "WEEKLY",
                customInterval: 1,
                weekdays: [],
                endDate: undefined,
              }
            : r
        }
        onChange={(next) => {
          if (next.preset === "NONE") {
            // Reset weekdays/endDate when clearing recurrence
            onChange({
              preset: "NONE",
              customFrequency: "WEEKLY",
              customInterval: 1,
              weekdays: [],
              endDate: undefined,
            });
          } else {
            onChange(next);
          }
        }}
      />
    </div>
  );
}
