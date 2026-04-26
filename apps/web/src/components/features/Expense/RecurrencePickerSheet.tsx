import {
  Cell,
  Modal,
  Navigation,
  Section,
  Text,
  Title,
  IconButton,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  mainButton,
  secondaryButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Hash,
  Repeat,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  PRESET_LABEL,
  type RecurrencePreset,
  type Weekday,
  type CanonicalFrequency,
} from "./recurrencePresets";

// Noun forms used in the Custom screen so the cells read as
// "Repeat every / 2 / weeks" or "Repeat every / 1 / week" depending on
// the interval. Frequency cell flips its display value based on interval.
const FREQ_UNIT_SINGULAR: Record<CanonicalFrequency, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};
const FREQ_UNIT_PLURAL: Record<CanonicalFrequency, string> = {
  DAILY: "days",
  WEEKLY: "weeks",
  MONTHLY: "months",
  YEARLY: "years",
};
const freqUnit = (f: CanonicalFrequency, interval: number): string =>
  interval === 1 ? FREQ_UNIT_SINGULAR[f] : FREQ_UNIT_PLURAL[f];

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
  "MONTHLY",
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
  /**
   * The expense's transaction date as YYYY-MM-DD. Used to pre-fill the
   * weekday when the user taps Weekly / Biweekly from the preset list,
   * matching Apple Reminders' behaviour ("every Monday" if today is Monday).
   */
  defaultWeekdayFromDate?: string;
}

type Screen = "top" | "weekly" | "custom";

const WEEKDAY_INDEX: Weekday[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

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

function weekdayOf(dateStr: string | undefined): Weekday | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return WEEKDAY_INDEX[d.getDay()];
}

export default function RecurrencePickerSheet({
  open,
  onOpenChange,
  value,
  onChange,
  defaultWeekdayFromDate,
}: Props) {
  const [screen, setScreen] = useState<Screen>("top");
  // Pending weekday selection while the user is in the Weekly sub-screen.
  // Only committed to the form on the header check tap — gives Apple
  // Reminders' "edit then confirm" feel and prevents flicker on the parent
  // Repeat Cell while the user is still toggling days.
  const [pendingWeekdays, setPendingWeekdays] = useState<Weekday[]>([]);

  // Read theme colors via the SDK signals (rather than CSS vars) — the
  // signals carry built-in fallback values when the Telegram client doesn't
  // pass the theme through, matching the pattern in AmountFormStep etc.
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tLinkColor = useSignal(themeParams.linkColor);

  // Reset to top whenever the modal reopens
  useEffect(() => {
    if (open) setScreen("top");
  }, [open]);

  // Telegram MainButton + SecondaryButton are rendered by the TMA host
  // outside the React tree, so they float on top of this Modal. Without
  // this, the wizard's "Next" button stays visible at the bottom and
  // users tap it expecting it to confirm their day-of-week selection
  // inside the sheet — but it tries to advance the parent step instead.
  // Snapshot pre-open visibility and restore on close so we don't show
  // the secondary button on a step where the parent had it hidden.
  useEffect(() => {
    if (!open) return;
    const prevMainVisible = mainButton.isVisible();
    const prevSecondaryVisible = secondaryButton.isVisible();
    mainButton.setParams.ifAvailable({ isVisible: false });
    secondaryButton.setParams.ifAvailable({ isVisible: false });
    return () => {
      mainButton.setParams.ifAvailable({ isVisible: prevMainVisible });
      secondaryButton.setParams.ifAvailable({
        isVisible: prevSecondaryVisible,
      });
    };
  }, [open]);

  const isWeekly =
    value.preset === "WEEKLY" ||
    (value.preset === "CUSTOM" && value.customFrequency === "WEEKLY");

  const headerTitle =
    screen === "top" ? "Repeat" : screen === "weekly" ? "Weekly" : "Custom";

  const commitWeekly = () => {
    if (pendingWeekdays.length === 0) return;
    tickSelection();
    onChange({
      ...value,
      preset: "WEEKLY",
      weekdays: pendingWeekdays,
    });
    onOpenChange(false);
  };

  // Custom commits live as the user toggles dropdowns/chips, so the header
  // Check just closes the modal — but block when CUSTOM+WEEKLY has no
  // weekdays selected (matches the form schema's superRefine).
  const customWeeklyEmpty =
    value.preset === "CUSTOM" &&
    value.customFrequency === "WEEKLY" &&
    value.weekdays.length === 0;
  const commitCustom = () => {
    if (customWeeklyEmpty) return;
    tickSelection();
    onOpenChange(false);
  };

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
        screen === "weekly" ? (
          <IconButton
            size="s"
            mode="gray"
            disabled={pendingWeekdays.length === 0}
            onClick={commitWeekly}
            aria-label="Confirm weekday selection"
          >
            <Check size={20} style={{ color: tLinkColor }} />
          </IconButton>
        ) : screen === "custom" ? (
          <IconButton
            size="s"
            mode="gray"
            disabled={customWeeklyEmpty}
            onClick={commitCustom}
            aria-label="Confirm custom recurrence"
          >
            <Check size={20} style={{ color: tLinkColor }} />
          </IconButton>
        ) : (
          <Modal.Close>
            <IconButton size="s" mode="gray">
              <X size={20} />
            </IconButton>
          </Modal.Close>
        )
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
                      return;
                    }
                    if (p === "WEEKLY") {
                      // Weekly requires at least one weekday — open the
                      // sub-picker pre-filled with the current selection
                      // (or the transaction date's weekday) and only
                      // commit when the user taps the header check.
                      const wd = weekdayOf(defaultWeekdayFromDate);
                      const initial =
                        value.preset === "WEEKLY" && value.weekdays.length > 0
                          ? value.weekdays
                          : wd
                            ? [wd]
                            : [];
                      setPendingWeekdays(initial);
                      setScreen("weekly");
                      return;
                    }
                    // DAILY / MONTHLY / YEARLY — self-evident, no sub-screen.
                    // Commit and close immediately (Apple Reminders style).
                    onChange({
                      ...value,
                      preset: p,
                      weekdays: [],
                    });
                    onOpenChange(false);
                  }}
                  after={
                    p === "WEEKLY" ? (
                      // Weekly opens a sub-picker, so it always shows a
                      // nav chevron — and stacks a check beside it when it
                      // is the active selection (so users can still tell
                      // which preset is committed).
                      <div className="flex items-center gap-1">
                        {value.preset === "WEEKLY" && (
                          <span className="text-(--tg-theme-link-color)">
                            ✓
                          </span>
                        )}
                        <ChevronRight size={16} />
                      </div>
                    ) : value.preset === p ? (
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
                  // First entry into Custom: commit preset=CUSTOM with
                  // sensible defaults so the parent Repeat Cell shows the
                  // live summary immediately. Defaults match Apple
                  // Reminders: every 1 week, on the transaction date's
                  // weekday. From there the user can bump interval, swap
                  // unit, or add more weekdays.
                  if (value.preset !== "CUSTOM") {
                    const wd = weekdayOf(defaultWeekdayFromDate);
                    onChange({
                      ...value,
                      preset: "CUSTOM",
                      customFrequency: value.customFrequency || "WEEKLY",
                      customInterval: value.customInterval || 1,
                      weekdays:
                        value.weekdays.length > 0
                          ? value.weekdays
                          : wd
                            ? [wd]
                            : [],
                    });
                  }
                  setScreen("custom");
                }}
                after={<ChevronRight size={16} />}
              >
                <span className="text-(--tg-theme-link-color)">
                  {PRESET_LABEL.CUSTOM}…
                </span>
              </Cell>
            </Section>
          </>
        )}

        {screen === "weekly" && (
          <Section header="Repeat on">
            {WEEKDAY_INDEX.map((wd) => {
              const selected = pendingWeekdays.includes(wd);
              return (
                <Cell
                  key={wd}
                  onClick={() => {
                    tickSelection();
                    setPendingWeekdays((prev) =>
                      prev.includes(wd)
                        ? prev.filter((x) => x !== wd)
                        : [...prev, wd]
                    );
                  }}
                  after={
                    selected ? (
                      <Check size={20} style={{ color: tLinkColor }} />
                    ) : null
                  }
                >
                  {WEEKDAY_FULL[wd]}
                </Cell>
              );
            })}
          </Section>
        )}

        {screen === "custom" && (
          <>
            {/* "Repeat every" section header carries the verb so the two
                cells beneath read top-down as the full phrase, e.g.
                "Repeat every / 2 / weeks". No standalone preview row is
                needed because the parent Repeat Cell on the amount step
                already renders the human-readable summary as a subtitle
                row underneath itself.
            */}
            <Section header="Repeat every">
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
                Interval
              </Cell>
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
                          {FREQ_UNIT_PLURAL[f]}
                        </option>
                      ))}
                    </select>
                    <Navigation>
                      <Text>
                        {freqUnit(value.customFrequency, value.customInterval)}
                      </Text>
                    </Navigation>
                  </div>
                }
              >
                Frequency
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
                          // Use SDK signals + inline style for the selected
                          // colors. Telegram CSS vars are unreliable across
                          // clients; the SDK signals have JS-side fallbacks
                          // that work even when the vars aren't passed through.
                          // Mirrors the pattern in AmountFormStep / other
                          // theme-color uses in this codebase.
                          "flex size-8 items-center justify-center rounded-full text-[13px] font-medium transition-colors " +
                          (selected
                            ? "shadow-sm"
                            : "bg-(--tg-theme-secondary-bg-color)")
                        }
                        style={
                          selected
                            ? {
                                backgroundColor: tButtonColor,
                                color: tButtonTextColor,
                              }
                            : undefined
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
      </div>
    </Modal>
  );
}
