import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Cell,
  LargeTitle,
  Section,
  Subheadline,
  Text,
  Textarea,
} from "@telegram-apps/telegram-ui";
import { Calendar, ChevronRight, Currency } from "lucide-react";
import { useState } from "react";
import { useStore } from "@tanstack/react-form";

import AmountInput from "@components/ui/AmountInput";
import CurrencySelectionModal from "@components/ui/CurrencySelectionModal";
import { withForm } from "@/hooks";
import { trpc } from "@/utils/trpc";
import { formatDateKey, formatExpenseDate } from "@utils/date";
import { paymentFormOpts, PAYMENT_DESCRIPTION_MAX } from "./RecordPaymentForm";

const flagUrl = (countryCode: string) =>
  `https://hatscripts.github.io/circle-flags/flags/${countryCode.toLowerCase()}.svg`;

const PaymentAmountStep = withForm({
  ...paymentFormOpts,
  props: { chatId: 0, showAmountError: false, showDescriptionError: false },
  render: function Render({
    form,
    chatId,
    showAmountError,
    showDescriptionError,
  }) {
    const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
    const tUserData = useSignal(initData.user);
    const currency = useStore(form.store, (s) => s.values.currency);
    const [currencyModalOpen, setCurrencyModalOpen] = useState(false);

    const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });
    const { data: supportedCurrencies } =
      trpc.currency.getSupportedCurrencies.useQuery({});
    const info = supportedCurrencies?.find((c) => c.code === currency);

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="flex w-full justify-between px-2">
            <Subheadline weight="2">Amount</Subheadline>
          </label>
          <Section>
            <form.AppField name="currency">
              {(field) => (
                <>
                  <Cell
                    before={
                      info?.countryCode ? (
                        <Avatar size={24}>
                          <img
                            src={flagUrl(info.countryCode)}
                            alt={`${info.name} flag`}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
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
                    {info?.name || "Paid in"}
                  </Cell>
                  <CurrencySelectionModal
                    open={currencyModalOpen}
                    onOpenChange={setCurrencyModalOpen}
                    selectedCurrency={currency}
                    onCurrencySelect={field.handleChange}
                    userId={tUserData?.id ?? 0}
                    chatId={chatId}
                    featuredCurrencies={[dChatData?.baseCurrency || "SGD"]}
                  />
                </>
              )}
            </form.AppField>
            <form.AppField name="amount">
              {(field) => (
                <AmountInput
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  after={
                    <LargeTitle style={{ color: tSubtitleTextColor }}>
                      {currency}
                    </LargeTitle>
                  }
                  placeholder="0.00"
                  hasError={showAmountError}
                  autoFocus
                />
              )}
            </form.AppField>
          </Section>
        </div>

        <form.AppField name="description">
          {(descriptionField) => (
            <form.AppField name="date">
              {(dateField) => (
                <div className="flex flex-col gap-2">
                  <label className="flex w-full justify-between px-2">
                    <Subheadline weight="2">Details</Subheadline>
                    <span className="text-sm text-gray-500">
                      {descriptionField.state.value.length} /{" "}
                      {PAYMENT_DESCRIPTION_MAX} characters
                    </span>
                  </label>
                  <Section>
                    <Textarea
                      className="text-wrap"
                      status={showDescriptionError ? "error" : "default"}
                      placeholder="e.g. Concert tickets"
                      value={descriptionField.state.value}
                      onBlur={descriptionField.handleBlur}
                      onChange={(e) => {
                        if (e.target.value.length > PAYMENT_DESCRIPTION_MAX)
                          return;
                        descriptionField.handleChange(e.target.value);
                      }}
                    />
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
                  </Section>
                </div>
              )}
            </form.AppField>
          )}
        </form.AppField>
      </div>
    );
  },
});

export default PaymentAmountStep;
