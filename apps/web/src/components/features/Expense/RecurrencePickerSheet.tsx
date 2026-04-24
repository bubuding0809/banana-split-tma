import {
  Cell,
  Modal,
  Navigation,
  Section,
  Text,
  Title,
  IconButton,
} from "@telegram-apps/telegram-ui";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { ChevronLeft, ChevronRight, Hash, Repeat, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  PRESET_LABEL,
  type RecurrencePreset,
  type Weekday,
  type CanonicalFrequency,
} from "./recurrencePresets";

const FREQ_LABEL: Record<CanonicalFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

const WEEKDAY_FULL: Record<Weekday, string> = {
  SUN: "Sunday",
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
};

const PRESETS: RecurrencePreset[] = [
  "NONE",
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "EVERY_3_MONTHS",
  "EVERY_6_MONTHS",
  "YEARLY",
];

const WEEKDAYS: { id: Weekday; label: string }[] = [
  { id: "SUN", label: "S" },
  { id: "MON", label: "M" },
  { id: "TUE", label: "Tu" },
  { id: "WED", label: "W" },
  { id: "THU", label: "Th" },
  { id: "FRI", label: "F" },
  { id: "SAT", label: "S" },
];

const CUSTOM_FREQS: CanonicalFrequency[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
];
const INTERVALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export interface RecurrenceValue {
  preset: RecurrencePreset;
  customFrequency: CanonicalFrequency;
  customInterval: number;
  weekdays: Weekday[];
  endDate?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: RecurrenceValue;
  onChange: (next: RecurrenceValue) => void;
}

type Screen = "top" | "custom" | "endDate";

const tickSelection = () => {
  try {
    hapticFeedback.selectionChanged();
  } catch {}
};
const tickNav = () => {
  try {
    hapticFeedback.impactOccurred("light");
  } catch {}
};

export default function RecurrencePickerSheet({
  open,
  onOpenChange,
  value,
  onChange,
}: Props) {
  const [screen, setScreen] = useState<Screen>("top");

  // Reset to top whenever the modal reopens
  useEffect(() => {
    if (open) setScreen("top");
  }, [open]);

  const isWeekly =
    value.preset === "WEEKLY" ||
    value.preset === "BIWEEKLY" ||
    (value.preset === "CUSTOM" && value.customFrequency === "WEEKLY");

  const headerTitle =
    screen === "top" ? "Repeat" : screen === "custom" ? "Custom" : "End Date";

  const header = (
    <Modal.Header
      before={
        screen === "top" ? (
          <Title weight="2" level="3">
            {headerTitle}
          </Title>
        ) : (
          <div className="flex items-center gap-2">
            <IconButton
              size="s"
              mode="gray"
              onClick={() => {
                tickNav();
                setScreen("top");
              }}
            >
              <ChevronLeft size={20} />
            </IconButton>
            <Title weight="2" level="3">
              {headerTitle}
            </Title>
          </div>
        )
      }
      after={
        <Modal.Close>
          <IconButton size="s" mode="gray">
            <X size={20} />
          </IconButton>
        </Modal.Close>
      }
    />
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange} header={header}>
      <div className="max-h-[75vh] space-y-3 overflow-y-auto p-3 pb-6">
        {screen === "top" && (
          <>
            <Section>
              {PRESETS.map((p) => (
                <Cell
                  key={p}
                  onClick={() => {
                    tickSelection();
                    if (p === "NONE") {
                      onChange({ ...value, preset: "NONE" });
                      onOpenChange(false);
                    } else {
                      // Preserve weekdays only when switching between weekly-shaped presets
                      const keepWeekdays =
                        p === "WEEKLY" || p === "BIWEEKLY"
                          ? value.weekdays
                          : [];
                      onChange({
                        ...value,
                        preset: p,
                        weekdays: keepWeekdays,
                      });
                      // For weekly-shaped presets without weekdays selected
                      // yet, auto-navigate to custom so the user can pick them.
                      if (
                        (p === "WEEKLY" || p === "BIWEEKLY") &&
                        keepWeekdays.length === 0
                      ) {
                        setScreen("custom");
                      }
                    }
                  }}
                  after={
                    value.preset === p ? (
                      <span className="text-(--tg-theme-link-color)">✓</span>
                    ) : null
                  }
                >
                  {PRESET_LABEL[p]}
                </Cell>
              ))}
              <Cell
                onClick={() => {
                  tickNav();
                  setScreen("custom");
                }}
                after={<ChevronRight size={16} />}
              >
                <span className="text-(--tg-theme-link-color)">
                  {PRESET_LABEL.CUSTOM}…
                </span>
              </Cell>
            </Section>
            {value.preset !== "NONE" && (
              <Section>
                <Cell
                  onClick={() => {
                    tickNav();
                    setScreen("endDate");
                  }}
                  after={
                    <span className="text-(--tg-theme-subtitle-text-color)">
                      {value.endDate ?? "Never"} ›
                    </span>
                  }
                >
                  End Date
                </Cell>
              </Section>
            )}
          </>
        )}

        {screen === "custom" && (
          <>
            <Section>
              <Cell
                Component="label"
                htmlFor="recurrence-frequency-select"
                before={<Repeat size={20} />}
                after={
                  <div className="relative">
                    <select
                      id="recurrence-frequency-select"
                      value={value.customFrequency}
                      onChange={(e) => {
                        tickSelection();
                        onChange({
                          ...value,
                          preset: "CUSTOM",
                          customFrequency: e.target.value as CanonicalFrequency,
                        });
                      }}
                      className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                    >
                      {CUSTOM_FREQS.map((f) => (
                        <option key={f} value={f}>
                          {FREQ_LABEL[f]}
                        </option>
                      ))}
                    </select>
                    <Navigation>
                      <Text>{FREQ_LABEL[value.customFrequency]}</Text>
                    </Navigation>
                  </div>
                }
              >
                Frequency
              </Cell>
              <Cell
                Component="label"
                htmlFor="recurrence-interval-select"
                before={<Hash size={20} />}
                after={
                  <div className="relative">
                    <select
                      id="recurrence-interval-select"
                      value={value.customInterval}
                      onChange={(e) => {
                        tickSelection();
                        onChange({
                          ...value,
                          preset: "CUSTOM",
                          customInterval: Number(e.target.value),
                        });
                      }}
                      className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                    >
                      {INTERVALS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <Navigation>
                      <Text>{value.customInterval}</Text>
                    </Navigation>
                  </div>
                }
              >
                Every
              </Cell>
            </Section>
            {isWeekly && (
              <Section header="On these days">
                <div className="flex justify-between gap-1.5 p-3">
                  {WEEKDAYS.map((d) => {
                    const selected = value.weekdays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={WEEKDAY_FULL[d.id]}
                        onClick={() => {
                          tickSelection();
                          const next = selected
                            ? value.weekdays.filter((w) => w !== d.id)
                            : [...value.weekdays, d.id];
                          onChange({ ...value, weekdays: next });
                        }}
                        className={
                          "flex size-8 items-center justify-center rounded-full text-[13px] font-medium " +
                          (selected
                            ? "bg-(--tg-theme-button-color) text-(--tg-theme-button-text-color)"
                            : "bg-(--tg-theme-secondary-bg-color)")
                        }
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}
          </>
        )}

        {screen === "endDate" && (
          <Section>
            <Cell
              onClick={() => {
                tickSelection();
                onChange({ ...value, endDate: undefined });
              }}
              after={
                value.endDate ? null : (
                  <span className="text-(--tg-theme-link-color)">✓</span>
                )
              }
            >
              No end date
            </Cell>
            <Cell className="relative">
              <input
                type="date"
                value={value.endDate ?? ""}
                onChange={(e) =>
                  onChange({ ...value, endDate: e.target.value || undefined })
                }
                className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
              />
              Pick a date
              <span className="text-(--tg-theme-subtitle-text-color) ml-auto">
                {value.endDate ?? "—"}
              </span>
            </Cell>
          </Section>
        )}
      </div>
    </Modal>
  );
}
