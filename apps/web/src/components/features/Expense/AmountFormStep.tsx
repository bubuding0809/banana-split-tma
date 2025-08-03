import { getRouteApi } from "@tanstack/react-router";
import {
  hapticFeedback,
  mainButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Cell,
  Section,
  Subheadline,
  Textarea,
} from "@telegram-apps/telegram-ui";
import { ArrowDownUp, ChevronRight, Currency } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@utils/cn";
import { z } from "zod";

import FieldInfo from "@components/ui/FieldInfo";
import { Decimal } from "decimal.js";

import { expenseFormSchema } from "./AddExpenseForm.type";
import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { trpc } from "@/utils/trpc";
import { useStore } from "@tanstack/react-form";

const routeApi = getRouteApi("/_tma/chat/$chatId_/add-expense");

const AmountFormStep = withForm({
  ...formOpts,
  props: {
    step: 0,
    isLastStep: false,
  },
  render: function Render({ form, isLastStep, step }) {
    const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
    const isDarkMode = useSignal(themeParams.isDark);
    const navigate = routeApi.useNavigate();
    const { expenseCurrency } = useStore(form.store, (state) => ({
      expenseCurrency: state.values.currency,
    }));
    const { chatId } = routeApi.useParams();

    const { data: dChatData } = trpc.chat.getChat.useQuery({
      chatId: Number(chatId),
    });
    const displayCurrency = dChatData?.baseCurrency || "SGD";

    const [containerWidth, setContainerWidth] = useState(0);
    const measureRef = useRef(null);
    const amountFieldRef = useRef<HTMLInputElement>(null);
    const descriptionFieldRef = useRef<HTMLInputElement>(null);

    const { data: supportedCurrencies } =
      trpc.currency.getSupportedCurrencies.useQuery({});

    const { data: exchangeRate } = trpc.currency.getCurrentRate.useQuery({
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

        if (
          form.state.fieldMeta.amount.errors.length ||
          form.state.fieldMeta.description.errors.length
        ) {
          for (const [ref, errors] of [
            [amountFieldRef, form.state.fieldMeta.amount.errors] as const,
            [
              descriptionFieldRef,
              form.state.fieldMeta.description.errors,
            ] as const,
          ]) {
            if (errors.length) {
              ref.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
              ref.current?.focus();
              break;
            }
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

    useEffect(() => {
      if (measureRef.current) {
        const resizeObserver = new ResizeObserver((entries) => {
          setContainerWidth(entries[0].contentRect.width);
        });

        resizeObserver.observe(measureRef.current);
        return () => resizeObserver.disconnect();
      }
    }, []);

    //* Handlers ===================================================================================
    const handleAmountChange = (value: string) => {
      const cleanValue = value.replace(/[^\d.]/g, "");
      const parts = cleanValue.split(".");
      if (parts.length > 2) return;

      let [wholeNumber] = parts;
      if (wholeNumber.length > 10) {
        wholeNumber = wholeNumber.slice(0, 10);
      }

      let decimal = "";
      if (parts.length === 2) {
        decimal = `.${parts[1].slice(0, 2)}`;
      }

      return wholeNumber + decimal;
    };

    const getFontSize = (
      amount: z.infer<typeof expenseFormSchema>["amount"]
    ) => {
      // Create measurement element
      const testDiv = document.createElement("div");
      testDiv.style.fontSize = "60px";
      testDiv.style.fontWeight = "300";
      testDiv.style.position = "absolute";
      testDiv.style.visibility = "hidden";
      testDiv.style.whiteSpace = "nowrap";
      testDiv.textContent = amount || "0";
      document.body.appendChild(testDiv);

      const textWidth = testDiv.offsetWidth;
      document.body.removeChild(testDiv);

      // Account for the currency label and padding
      const availableWidth = containerWidth - 100;

      if (textWidth <= availableWidth) return "60px";

      // Calculate scale ratio needed
      const ratio = availableWidth / textWidth;
      const fontSize = Math.max(28, Math.floor(60 * ratio));

      // Return the closest size from our predefined steps
      if (fontSize >= 55) return "60px";
      if (fontSize >= 45) return "48px";
      if (fontSize >= 35) return "40px";
      if (fontSize >= 28) return "32px";
      return "28px";
    };

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
                    <Cell
                      Component="label"
                      before={<Currency />}
                      after={
                        <div className="flex items-center">
                          <select
                            value={expenseCurrency}
                            onChange={(e) => {
                              field.handleChange(e.target.value);
                            }}
                            className="appearance-none focus:outline-none"
                          >
                            {supportedCurrencies?.map((currency) => (
                              <option key={currency.code} value={currency.code}>
                                {currency.flagEmoji} {currency.code}
                              </option>
                            ))}
                          </select>
                          <ChevronRight size={20} />
                        </div>
                      }
                    >
                      Expensed in
                    </Cell>
                  )}
                </form.AppField>
                <div
                  className={cn(
                    "rounded-xl p-2 px-4",
                    field.state.meta.isTouched &&
                      field.state.meta.errors.length &&
                      "ring-2 ring-red-600"
                  )}
                  style={{
                    backgroundColor: isDarkMode ? "#212121" : tSectionBgColor,
                  }}
                >
                  <div>
                    {/* Amount Input */}
                    <div
                      className="mr-4 flex flex-1 items-baseline overflow-hidden"
                      ref={measureRef}
                    >
                      <div className="flex w-full items-baseline ring-green-500 ring-offset-1">
                        <input
                          ref={amountFieldRef}
                          type="text"
                          inputMode="decimal"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          tabIndex={0}
                          autoFocus
                          onChange={(e) => {
                            const value = handleAmountChange(e.target.value);
                            if (value === undefined) return;
                            if (value === "" || !isNaN(Number(value))) {
                              field.handleChange(value);
                            }
                          }}
                          placeholder="0"
                          className={cn(
                            "max-w-full bg-transparent focus:outline-none",
                            field.state.meta.errors.length &&
                              field.state.meta.isTouched &&
                              "text-red-600"
                          )}
                          style={{
                            fontSize: getFontSize(field.state.value),
                            padding: "0",
                            margin: "0",
                            width: "100%",
                          }}
                        />
                        <span
                          className={cn(
                            "ml-2 flex-shrink-0 text-4xl text-gray-500"
                          )}
                        >
                          {supportedCurrencies?.find(
                            (c) => c.code === expenseCurrency
                          )?.symbol || "$"}
                        </span>
                      </div>
                    </div>

                    {/* Converted */}
                    {field.state.value &&
                      expenseCurrency !== displayCurrency && (
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="flex items-center text-lg text-gray-500">
                            <span>≈</span>
                            <span className="mx-1">
                              {getConvertedAmount(field.state.value)}
                            </span>
                            <span className="text-gray-400">
                              {displayCurrency}
                            </span>
                          </div>
                          {exchangeRate && (
                            <button
                              type="button"
                              onClick={handleUseConvertedAmount}
                              className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600 transition-colors"
                            >
                              <ArrowDownUp size={16} />
                              <span>Convert to {displayCurrency} amount</span>
                            </button>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              </Section>
              <div className="px-2">
                <FieldInfo />
              </div>
            </div>
          )}
        </form.AppField>

        {/* Description */}
        <form.AppField name="description">
          {(field) => (
            <div className="flex flex-col gap-2">
              <label
                className={cn(
                  "-top-7 flex w-full justify-between px-2 transition-all duration-500 ease-in-out"
                )}
              >
                <Subheadline weight="2">Description</Subheadline>
                <span className="text-sm text-gray-500">
                  {field.state.value.length} / {descriptionMaxLength} characters
                </span>
              </label>
              <Textarea
                className="text-wrap"
                //@ts-expect-error There should be a ref for Textarea
                ref={descriptionFieldRef}
                status={
                  field.state.meta.isTouched && field.state.meta.errors.length
                    ? "error"
                    : "default"
                }
                placeholder="Supper at Paradise Biryani"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  if (e.target.value.length > (descriptionMaxLength ?? 60))
                    return;
                  field.handleChange(e.target.value);
                }}
              />
              <div className="px-2">
                <FieldInfo />
              </div>
            </div>
          )}
        </form.AppField>
      </div>
    );
  },
});

export default AmountFormStep;
