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
import { ArrowUp, Calendar, ChevronRight, Currency } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@utils/cn";
import { z } from "zod";

import FieldInfo from "@components/ui/FieldInfo";
import AmountInput from "@components/ui/AmountInput";
import CurrencySelectionModal from "@components/ui/CurrencySelectionModal";
import { Decimal } from "decimal.js";

import { expenseFormSchema } from "./AddExpenseForm.type";
import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { formatDateKey, formatExpenseDate } from "@utils/date";
import { trpc } from "@/utils/trpc";
import { useStore } from "@tanstack/react-form";
import { UseNavigateResult } from "@tanstack/react-router";
import CategoryFormStep from "./CategoryFormStep";

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

        if (
          form.state.fieldMeta.amount?.errors.length ||
          form.state.fieldMeta.description?.errors.length ||
          form.state.fieldMeta.date?.errors.length
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
      expenseFormSchema.shape.description._def.checks.find(
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
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      />
                      Transaction Date
                    </Cell>
                  </Section>
                  <div className="px-2">
                    <FieldInfo />
                  </div>
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
