import { getRouteApi } from "@tanstack/react-router";
import { hapticFeedback, mainButton } from "@telegram-apps/sdk-react";
import { Input, Subheadline } from "@telegram-apps/telegram-ui";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@utils/cn";
import { z } from "zod";

import FieldInfo from "@components/ui/FieldInfo";

import { expenseFormSchema } from "./AddExpenseForm.type";
import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";

const CURRENCIES = {
  SGD: {
    symbol: "SGD",
    name: "Singapore Dollar",
    rate: 1,
  },
  USD: {
    symbol: "USD",
    name: "US Dollar",
    rate: 0.741488522,
  },
  EUR: {
    symbol: "EUR",
    name: "Euro",
    rate: 0.68,
  },
  GBP: {
    symbol: "GBP",
    name: "British Pound",
    rate: 0.58,
  },
  JPY: {
    symbol: "JPY",
    name: "Japanese Yen",
    rate: 113.45,
  },
} as const;

const SELECT_STYLES = {
  WebkitAppearance: "none",
  MozAppearance: "none",
  appearance: "none",
  background: "transparent",
  border: "none",
  color: "#3B82F6",
  paddingRight: "1.5rem",
  cursor: "pointer",
} as const;

const routeApi = getRouteApi("/_tma/chat/$chatId_/add-expense");

const AmountFormStep = withForm({
  ...formOpts,
  props: {
    step: 0,
    isLastStep: false,
  },
  render: function Render({ form, isLastStep, step }) {
    const navigate = routeApi.useNavigate();
    const [expenseCurrency, setExpenseCurrency] =
      useState<keyof typeof CURRENCIES>("SGD");
    const [displayCurrency, setDisplayCurrency] =
      useState<keyof typeof CURRENCIES>("SGD");
    const [containerWidth, setContainerWidth] = useState(0);
    const measureRef = useRef(null);

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
      const numAmount = parseFloat(amount || "0");
      const amountInSGD =
        expenseCurrency === "SGD"
          ? numAmount
          : numAmount / CURRENCIES[expenseCurrency].rate;
      const convertedAmount = amountInSGD * CURRENCIES[displayCurrency].rate;
      return convertedAmount.toFixed(2);
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
              <div
                className={cn(
                  "rounded-xl p-3 px-4 bg-[#212121]",
                  field.state.meta.isTouched &&
                    field.state.meta.errors.length &&
                    "ring-2 ring-red-600"
                )}
              >
                {/* Currency Selection */}
                <div className="flex items-center">
                  <Subheadline>Expensed in</Subheadline>
                  <div className="relative ml-2">
                    <select
                      style={SELECT_STYLES}
                      value={expenseCurrency}
                      onChange={(e) =>
                        setExpenseCurrency(
                          e.target.value as keyof typeof CURRENCIES
                        )
                      }
                      className="pr-6 focus:outline-none"
                    >
                      {Object.entries(CURRENCIES).map(([symbol]) => (
                        <option key={symbol} value={symbol}>
                          {symbol}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
                  </div>
                </div>

                <div>
                  {/* Amount Input */}
                  <div
                    className="mr-4 flex flex-1 items-baseline overflow-hidden"
                    ref={measureRef}
                  >
                    <div className="flex w-full items-baseline ring-green-500 ring-offset-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          const value = handleAmountChange(e.target.value);
                          if (value === undefined) return;
                          if (value === "" || !isNaN(Number(value))) {
                            field.handleChange(value);
                          }
                        }}
                        placeholder="0"
                        className={cn(
                          "max-w-full bg-transparent font-light focus:outline-none",
                          field.state.meta.errors.length && "text-red-600"
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
                          // field.state.meta.errors.length && 'text-red-600'
                        )}
                      >
                        {expenseCurrency}
                      </span>
                    </div>
                  </div>

                  {/* Converted */}
                  {field.state.value && expenseCurrency !== displayCurrency && (
                    <div className="mt-2 flex items-center text-lg text-gray-500">
                      <span>≈</span>
                      <span className="mx-1">
                        {getConvertedAmount(field.state.value)}
                      </span>
                      <div className="relative">
                        <select
                          style={SELECT_STYLES}
                          value={displayCurrency}
                          onChange={(e) =>
                            setDisplayCurrency(
                              e.target.value as keyof typeof CURRENCIES
                            )
                          }
                          className="pr-6 focus:outline-none"
                        >
                          {Object.entries(CURRENCIES).map(([symbol]) => (
                            <option key={symbol} value={symbol}>
                              {symbol}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-2">
                <FieldInfo />
              </div>
            </div>
          )}
        </form.AppField>

        {/* Description */}
        <div>
          <form.AppField name="description">
            {(field) => (
              <div className="flex flex-col gap-2">
                <label
                  className={cn(
                    "-top-7 flex w-full justify-between px-2 transition-all duration-500 ease-in-out"
                  )}
                >
                  <Subheadline>Description</Subheadline>
                  <span className="text-sm text-gray-500">
                    {field.state.value.length} / {descriptionMaxLength}{" "}
                    characters
                  </span>
                </label>
                <Input
                  status={
                    field.state.meta.isTouched && field.state.meta.errors.length
                      ? "error"
                      : "default"
                  }
                  placeholder="What was this for?"
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
      </div>
    );
  },
});

export default AmountFormStep;
