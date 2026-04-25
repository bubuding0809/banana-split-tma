import {
  hapticFeedback,
  mainButton,
  themeParams,
  useSignal,
  initData,
} from "@telegram-apps/sdk-react";
import {
  Button,
  Text,
  Cell,
  Section,
  Skeleton,
  Subheadline,
  Textarea,
  LargeTitle,
  Avatar,
} from "@telegram-apps/telegram-ui";
import {
  ArrowUp,
  Calendar,
  CalendarOff,
  ChevronRight,
  Currency,
  Repeat as RepeatIcon,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@utils/cn";
import { z } from "zod";

import FieldInfo from "@components/ui/FieldInfo";
import AmountInput from "@components/ui/AmountInput";
import CurrencySelectionModal from "@components/ui/CurrencySelectionModal";
import { Decimal } from "decimal.js";

import {
  expenseFormBaseSchema,
  expenseFormSchema,
} from "./AddExpenseForm.type";
import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { formatDateKey, formatExpenseDate } from "@utils/date";
import { trpc } from "@/utils/trpc";
import { useStore } from "@tanstack/react-form";
import { UseNavigateResult } from "@tanstack/react-router";
import CategoryFormStep from "./CategoryFormStep";
import RecurrencePickerSheet, {
  type RecurrenceValue,
} from "./RecurrencePickerSheet";
import {
  presetToTemplate,
  formatRecurrenceSummary,
  PRESET_LABEL,
} from "./recurrencePresets";

// Note: routeApi will be passed as prop since this component is used in both add and edit flows

const AmountFormStep = withForm({
  ...formOpts,
  props: {
    step: 0,
    isLastStep: false,
    navigate: (() => {}) as unknown as UseNavigateResult<
      "/chat/$chatId/add-expense" | "/chat/$chatId/edit-expense/$expenseId"
    >,
    chatId: 0,
  },
  render: function Render({ form, isLastStep, step, navigate, chatId }) {
    const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
    const tUserData = useSignal(initData.user);
    const { expenseCurrency } = useStore(form.store, (state) => ({
      expenseCurrency: state.values.currency,
    }));

    const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
    const [recurrenceOpen, setRecurrenceOpen] = useState(false);

    const { data: dChatData } = trpc.chat.getChat.useQuery({
      chatId: Number(chatId),
    });
    const displayCurrency = dChatData?.baseCurrency || "SGD";
    const userId = tUserData?.id ?? 0;

    const amountInputRef = useRef<HTMLInputElement>(null);
    const descriptionFieldRef = useRef<HTMLInputElement>(null);

    const { data: supportedCurrencies } =
      trpc.currency.getSupportedCurrencies.useQuery({});

    const { data: exchangeRate, status: exchangeRateStatus } =
      trpc.currency.getCurrentRate.useQuery({
        baseCurrency: expenseCurrency,
        targetCurrency: displayCurrency,
      });

    // Configure main button click
    useEffect(() => {
      const offClick = mainButton.onClick.ifAvailable(() => {
        form.validateSync("change");
        form.setFieldMeta("amount", (prev) => ({ ...prev, isTouched: true }));
        form.setFieldMeta("description", (prev) => ({
          ...prev,
          isTouched: true,
        }));
        form.setFieldMeta("date", (prev) => ({ ...prev, isTouched: true }));
        form.setFieldMeta("recurrence", (prev) => ({
          ...prev,
          isTouched: true,
        }));

        if (
          form.state.fieldMeta.amount?.errors.length ||
          form.state.fieldMeta.description?.errors.length ||
          form.state.fieldMeta.date?.errors.length ||
          form.state.fieldMeta.recurrence?.errors.length
        ) {
          // Focus the first field with errors
          if (form.state.fieldMeta.amount?.errors.length) {
            amountInputRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            amountInputRef.current?.focus({
              preventScroll: true,
            });
          } else if (form.state.fieldMeta.description?.errors.length) {
            descriptionFieldRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            descriptionFieldRef.current?.focus({
              preventScroll: true,
            });
          }
          return hapticFeedback.notificationOccurred("warning");
        }
        hapticFeedback.notificationOccurred("success");

        // Submit form if last step else navigate to next step
        if (isLastStep) {
          mainButton.setParams.ifAvailable({
            isLoaderVisible: true,
          });
          form.handleSubmit();
        } else {
          navigate({
            search: (prev) => ({
              ...prev,
              currentFormStep: step + 1,
            }),
          });
        }
      });

      return () => {
        offClick?.();
      };
    }, [step, form, navigate, isLastStep]);

    //* Handlers ===================================================================================

    const getConvertedAmount = (
      amount: z.infer<typeof expenseFormSchema>["amount"]
    ) => {
      if (!amount || amount === "0") return "0.00";

      // Use Decimal for precise currency conversion
      const amountDecimal = new Decimal(amount);
      const rate = exchangeRate?.rate || 1;
      return amountDecimal.mul(rate).toFixed(2);
    };

    const handleUseConvertedAmount = () => {
      const currentAmount = form.getFieldValue("amount");
      if (!currentAmount || currentAmount === "0") return;

      const convertedAmount = getConvertedAmount(currentAmount);

      // Update both amount and currency fields
      form.setFieldValue("amount", convertedAmount);
      form.setFieldValue("currency", displayCurrency);

      // Provide haptic feedback
      hapticFeedback.notificationOccurred("success");
    };

    const descriptionMaxLength =
      expenseFormBaseSchema.shape.description._def.checks.find(
        (check) => check.kind === "max"
      )?.value;

    // Get flag URL for selected currency
    const getFlagUrl = (countryCode: string): string => {
      const normalizedCode = countryCode.toLowerCase();
      return `https://hatscripts.github.io/circle-flags/flags/${normalizedCode}.svg`;
    };

    const selectedCurrencyInfo = supportedCurrencies?.find(
      (c) => c.code === expenseCurrency
    );

    return (
      <div className="flex flex-col gap-4">
        {/* Amount */}
        <form.AppField
          name="amount"
          validators={{
            onBlur: z.string().refine((value) => !value.endsWith("."), {
              message: "Amount needs to be a valid number",
            }),
          }}
        >
          {(field) => (
            <div className="flex flex-col gap-2">
              <label
                className={cn(
                  "-top-7 flex w-full justify-between px-2 transition-all duration-500 ease-in-out"
                )}
              >
                <Subheadline weight="2">Amount</Subheadline>
              </label>
              <Section>
                {/* Currency Selection */}
                <form.AppField name="currency">
                  {(field) => (
                    <>
                      <Cell
                        before={
                          selectedCurrencyInfo?.countryCode ? (
                            <Avatar size={24}>
                              <img
                                src={getFlagUrl(
                                  selectedCurrencyInfo.countryCode
                                )}
                                alt={`${selectedCurrencyInfo.name} flag`}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = "none";
                                  if (target.parentElement) {
                                    target.parentElement.textContent =
                                      selectedCurrencyInfo?.flagEmoji || "🌐";
                                  }
                                }}
                              />
                            </Avatar>
                          ) : (
                            <Currency />
                          )
                        }
                        after={<ChevronRight size={20} />}
                        onClick={() => setCurrencyModalOpen(true)}
                      >
                        {selectedCurrencyInfo?.name || "Expensed in"}
                      </Cell>

                      <CurrencySelectionModal
                        open={currencyModalOpen}
                        onOpenChange={setCurrencyModalOpen}
                        selectedCurrency={expenseCurrency}
                        onCurrencySelect={field.handleChange}
                        userId={userId}
                        chatId={Number(chatId)}
                        featuredCurrencies={[displayCurrency]}
                      />
                    </>
                  )}
                </form.AppField>

                {/* Amount Input */}
                <AmountInput
                  ref={amountInputRef}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  after={
                    <LargeTitle style={{ color: tSubtitleTextColor }}>
                      {supportedCurrencies?.find(
                        (c) => c.code === expenseCurrency
                      )?.code || "SGD"}
                    </LargeTitle>
                  }
                  placeholder="0.00"
                  hasError={
                    field.state.meta.isTouched &&
                    field.state.meta.errors.length > 0
                  }
                  autoFocus
                />

                {/* Converted */}
                {field.state.value && expenseCurrency !== displayCurrency ? (
                  <Cell
                    Component="label"
                    after={
                      <Button
                        disabled={exchangeRateStatus === "pending"}
                        mode="plain"
                        type="button"
                        onClick={handleUseConvertedAmount}
                        after={<ArrowUp size={20} />}
                        size="s"
                        style={{
                          paddingRight: "0px",
                        }}
                      >
                        Apply {displayCurrency}
                      </Button>
                    }
                  >
                    <Skeleton visible={exchangeRateStatus === "pending"}>
                      <Text
                        className="px-1"
                        style={{
                          color: tSubtitleTextColor,
                        }}
                      >
                        ≈ {getConvertedAmount(field.state.value)}{" "}
                        {displayCurrency}
                      </Text>
                    </Skeleton>
                  </Cell>
                ) : (
                  []
                )}
              </Section>
              <div className="px-2">
                <FieldInfo />
              </div>
            </div>
          )}
        </form.AppField>

        {/* Details (Description + Date) */}
        <form.AppField name="description">
          {(descriptionField) => (
            <form.AppField name="date">
              {(dateField) => (
                <div className="flex flex-col gap-2">
                  <label
                    className={cn(
                      "-top-7 flex w-full justify-between px-2 transition-all duration-500 ease-in-out"
                    )}
                  >
                    <Subheadline weight="2">Details</Subheadline>
                    <span className="text-sm text-gray-500">
                      {descriptionField.state.value.length} /{" "}
                      {descriptionMaxLength} characters
                    </span>
                  </label>
                  <Section>
                    {/* Description Textarea */}
                    <Textarea
                      className="text-wrap"
                      //@ts-expect-error There should be a ref for Textarea
                      ref={descriptionFieldRef}
                      status={
                        descriptionField.state.meta.isTouched &&
                        descriptionField.state.meta.errors.length
                          ? "error"
                          : "default"
                      }
                      placeholder="e.g. Supper at Paradise Biryani"
                      value={descriptionField.state.value}
                      onBlur={descriptionField.handleBlur}
                      onFocus={(e) => {
                        e.target.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                      onChange={(e) => {
                        if (
                          e.target.value.length > (descriptionMaxLength ?? 60)
                        )
                          return;
                        descriptionField.handleChange(e.target.value);
                      }}
                    />

                    {/* Date Cell */}
                    <Cell
                      before={
                        <Calendar
                          size={24}
                          style={{ color: tSubtitleTextColor }}
                        />
                      }
                      after={
                        <Text style={{ color: tSubtitleTextColor }}>
                          {dateField.state.value
                            ? formatExpenseDate(
                                new Date(dateField.state.value + "T00:00:00")
                              )
                            : "Select date"}
                        </Text>
                      }
                      className="relative"
                    >
                      <input
                        type="date"
                        value={dateField.state.value}
                        max={formatDateKey(new Date())}
                        onChange={(e) => {
                          dateField.handleChange(e.target.value);
                          hapticFeedback.impactOccurred("light");
                        }}
                        onBlur={dateField.handleBlur}
                        className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                      />
                      Transaction Date
                    </Cell>

                    {/* Repeat Cell — Apple Reminders pattern:
                        Row 1: title + short label ("Repeat | Weekly ›")
                        Row 2: separate full-width Cell with the human-readable
                        summary, only when active. Two cells avoid the title
                        getting squeezed by long summaries like
                        "Weekly on Sun, Wed, Thu, Fri, Sat, Tue".
                    */}
                    <form.AppField name="recurrence">
                      {(recurrenceField) => {
                        const r = recurrenceField.state
                          .value as RecurrenceValue;
                        const shortLabel =
                          r.preset === "NONE"
                            ? "Never"
                            : PRESET_LABEL[r.preset];
                        // Only show the secondary summary row when it adds
                        // info beyond the right-aligned label. WEEKLY shows
                        // the picked days, CUSTOM shows the full phrase.
                        // DAILY / MONTHLY / YEARLY are self-evident from
                        // "Daily ›" etc. End date now lives in its own
                        // dedicated cell below, so the summary intentionally
                        // passes endDate: null to avoid duplicating it.
                        const showSummary =
                          r.preset === "WEEKLY" || r.preset === "CUSTOM";
                        const summary = showSummary
                          ? formatRecurrenceSummary({
                              ...presetToTemplate({
                                preset: r.preset as Exclude<
                                  RecurrenceValue["preset"],
                                  "NONE"
                                >,
                                customFrequency: r.customFrequency,
                                customInterval: r.customInterval,
                                weekdays: r.weekdays,
                              }),
                              endDate: null,
                            })
                          : null;
                        const openSheet = () => {
                          hapticFeedback.impactOccurred("light");
                          setRecurrenceOpen(true);
                        };
                        return (
                          <div className="flex flex-col">
                            <Cell
                              before={
                                <RepeatIcon
                                  size={24}
                                  style={{ color: tSubtitleTextColor }}
                                />
                              }
                              after={
                                <Text style={{ color: tSubtitleTextColor }}>
                                  {shortLabel} ›
                                </Text>
                              }
                              onClick={openSheet}
                            >
                              Repeat
                            </Cell>
                            {summary && (
                              <Cell onClick={openSheet} multiline>
                                <Text style={{ color: tSubtitleTextColor }}>
                                  {summary}
                                </Text>
                              </Cell>
                            )}
                            {/* End Date — only relevant when a recurrence
                                is configured. Mirrors the Transaction Date
                                cell (native date overlay), with a Category-
                                style clear X when set. */}
                            {r.preset !== "NONE" && (
                              <Cell
                                before={
                                  <CalendarOff
                                    size={24}
                                    style={{ color: tSubtitleTextColor }}
                                  />
                                }
                                after={
                                  r.endDate ? (
                                    <div className="flex items-center gap-2">
                                      <Text
                                        style={{ color: tSubtitleTextColor }}
                                      >
                                        {formatExpenseDate(
                                          new Date(r.endDate + "T00:00:00")
                                        )}
                                      </Text>
                                      <span
                                        role="button"
                                        aria-label="Clear end date"
                                        onPointerDown={(e) => {
                                          // PointerDown stops the native
                                          // date picker before it has a
                                          // chance to open — onClick on the
                                          // input fires too late on iOS
                                          // Telegram, so the calendar pops
                                          // even when we stopPropagation.
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
                                          recurrenceField.handleChange({
                                            ...r,
                                            endDate: undefined,
                                          } as never);
                                          form.setFieldMeta(
                                            "recurrence",
                                            (prev) => ({
                                              ...prev,
                                              isTouched: true,
                                            })
                                          );
                                        }}
                                        // Sits above the absolute date input
                                        // (z-10) so taps land on the pill
                                        // instead of the hidden file picker.
                                        className="text-(--tg-theme-subtitle-text-color) relative z-20 flex size-6 items-center justify-center rounded-full"
                                        style={{
                                          backgroundColor:
                                            "rgba(127, 127, 127, 0.25)",
                                        }}
                                      >
                                        <X size={14} />
                                      </span>
                                    </div>
                                  ) : (
                                    <Text style={{ color: tSubtitleTextColor }}>
                                      Never
                                    </Text>
                                  )
                                }
                                className="relative"
                              >
                                <input
                                  type="date"
                                  value={r.endDate ?? ""}
                                  min={form.getFieldValue("date") || undefined}
                                  onChange={(e) => {
                                    hapticFeedback.impactOccurred("light");
                                    recurrenceField.handleChange({
                                      ...r,
                                      endDate: e.target.value || undefined,
                                    } as never);
                                    form.setFieldMeta("recurrence", (prev) => ({
                                      ...prev,
                                      isTouched: true,
                                    }));
                                  }}
                                  className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                                />
                                End Date
                              </Cell>
                            )}
                            <RecurrencePickerSheet
                              open={recurrenceOpen}
                              onOpenChange={setRecurrenceOpen}
                              defaultWeekdayFromDate={
                                form.getFieldValue("date") || undefined
                              }
                              value={
                                r.preset === "NONE"
                                  ? {
                                      preset: "NONE",
                                      customFrequency: "WEEKLY",
                                      customInterval: 1,
                                      weekdays: [],
                                      endDate: undefined,
                                    }
                                  : (r as RecurrenceValue)
                              }
                              onChange={(next) => {
                                if (next.preset === "NONE") {
                                  // Reset weekdays/endDate when clearing recurrence
                                  recurrenceField.handleChange({
                                    preset: "NONE",
                                    customFrequency: "WEEKLY",
                                    customInterval: 1,
                                    weekdays: [],
                                    endDate: undefined,
                                  } as never);
                                } else {
                                  recurrenceField.handleChange(next as never);
                                }
                              }}
                            />
                          </div>
                        );
                      }}
                    </form.AppField>
                  </Section>
                  <div className="px-2">
                    <FieldInfo />
                  </div>
                  {/* Recurrence errors render in the same below-section band
                      as description/amount/etc. so the cross-field "End date
                      must be on or after …" message reads as a sibling of
                      other field errors instead of squeezing into the
                      Section card. */}
                  <form.AppField name="recurrence">
                    {() => (
                      <div className="px-2">
                        <FieldInfo />
                      </div>
                    )}
                  </form.AppField>
                </div>
              )}
            </form.AppField>
          )}
        </form.AppField>

        {/* Category — auto-picked from description, or choose your own */}
        <CategoryFormStep form={form} chatId={chatId} />
      </div>
    );
  },
});

export default AmountFormStep;
