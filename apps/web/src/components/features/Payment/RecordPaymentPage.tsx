import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  mainButton,
  popup,
  secondaryButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Steps, Subheadline } from "@telegram-apps/telegram-ui";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@utils/cn";
import { formatDateKey, normalizeDateToMidnight } from "@/utils/date";
import { clearFormDraft, readFormDraft } from "@/utils/formDraft";
import { trpc } from "@/utils/trpc";
import { useAppForm, useFormDraftCache } from "@/hooks";
import PaymentAmountStep from "./PaymentAmountStep";
import PaymentWhoStep from "./PaymentWhoStep";
import { paymentFormOpts } from "./RecordPaymentForm";
import {
  isValidAmount,
  resolveInitialValues,
  toNotificationNames,
  toParties,
  type RecordPaymentValues,
} from "./recordPayment";

const routeApi = getRouteApi("/_tma/chat/$chatId_/record-payment");
const STEP_TITLES = ["Amount", "Who"] as const;

const RecordPaymentPage = ({ chatId }: { chatId: number }) => {
  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const navigate = routeApi.useNavigate();
  const globalNavigate = useNavigate();
  const search = routeApi.useSearch();
  const { prevTab, currentFormStep } = search;
  const userId = tUserData?.id ?? 0;
  const [showAmountError, setShowAmountError] = useState(false);

  const trpcUtils = trpc.useUtils();
  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });
  const { data: members } = trpc.chat.getMembers.useQuery({ chatId });
  const createSettlement = trpc.settlement.createSettlement.useMutation();

  const draftKey = `record-payment:${chatId}`;
  const [initialValues] = useState(() =>
    resolveInitialValues({
      prefill: {
        direction: search.direction,
        counterpartyId: search.counterpartyId,
        amount: search.amount,
        currency: search.currency,
      },
      draft: readFormDraft<RecordPaymentValues>(draftKey),
      baseCurrency: dChatData?.baseCurrency ?? "SGD",
      today: formatDateKey(new Date()),
    })
  );

  const backToChat = useCallback(
    (tab: "balance" | "transaction") =>
      globalNavigate({
        to: "/chat/$chatId",
        params: { chatId: chatId.toString() },
        search: { selectedTab: tab },
      }),
    [globalNavigate, chatId]
  );

  const form = useAppForm({
    ...paymentFormOpts,
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      const counterparty = members?.find(
        (m) => String(m.id) === value.counterpartyId
      );
      if (!counterparty || !tUserData?.firstName) {
        hapticFeedback.notificationOccurred("error");
        popup.open.ifAvailable({
          message: "Couldn't find that member. Please pick someone again.",
        });
        return;
      }
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
      mainButton.setParams.ifAvailable({
        isLoaderVisible: true,
        isEnabled: false,
      });
      try {
        await createSettlement.mutateAsync({
          chatId,
          ...toParties(value.direction, userId, Number(value.counterpartyId)),
          amount: Number(value.amount),
          currency: value.currency,
          description: value.description.trim() || undefined,
          date: normalizeDateToMidnight(new Date(value.date + "T00:00:00")),
          sendNotification: true,
          notificationKind: "payment",
          threadId: dChatData?.threadId
            ? Number(dChatData.threadId)
            : undefined,
          ...toNotificationNames(
            value.direction,
            { firstName: tUserData.firstName },
            {
              firstName: counterparty.firstName,
              username: counterparty.username,
            }
          ),
        });
        await Promise.all([
          trpcUtils.chat.getDebtorsMultiCurrency.invalidate({
            chatId,
            userId,
          }),
          trpcUtils.chat.getCreditorsMultiCurrency.invalidate({
            chatId,
            userId,
          }),
          trpcUtils.chat.getSimplifiedDebtsMultiCurrency.invalidate({
            chatId,
          }),
          trpcUtils.settlement.invalidate(),
        ]);
        hapticFeedback.notificationOccurred("success");
        // Reset before clearing: useFormDraftCache re-saves on the
        // post-submit store update otherwise (see AddExpensePage).
        form.reset(
          resolveInitialValues({
            prefill: {},
            draft: null,
            baseCurrency: dChatData?.baseCurrency ?? "SGD",
            today: formatDateKey(new Date()),
          })
        );
        clearFormDraft(draftKey);
        backToChat("transaction");
      } catch (error) {
        hapticFeedback.notificationOccurred("error");
        popup.open.ifAvailable({
          message:
            error instanceof Error
              ? error.message
              : "Failed to record payment.",
        });
        // Submit only happens on step 1, where « Back is shown — restore it.
        secondaryButton.setParams.ifAvailable({
          isVisible: true,
          isEnabled: true,
        });
      } finally {
        mainButton.setParams.ifAvailable({
          isLoaderVisible: false,
          isEnabled: true,
        });
      }
    },
  });

  useFormDraftCache(draftKey, form);

  // Show back button on mount
  useEffect(() => {
    backButton.show.ifAvailable();
    return () => {
      backButton.hide();
    };
  }, []);

  // Back button click: step 0 → chat, step 1 → step 0
  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      if (currentFormStep === 0) return backToChat(prevTab);
      navigate({ search: (prev) => ({ ...prev, currentFormStep: 0 }) });
    });
    return () => {
      off();
    };
  }, [currentFormStep, prevTab, navigate, backToChat]);

  // Main button text/colour per step
  useEffect(() => {
    const isFinal = currentFormStep === STEP_TITLES.length - 1;
    mainButton.setParams.ifAvailable({
      text: isFinal ? "Record payment" : "Next »",
      isVisible: true,
      isEnabled: true,
      hasShineEffect: isFinal,
      backgroundColor: isFinal ? "#00A86B" : tButtonColor,
    });
  }, [currentFormStep, tButtonColor]);

  // Main button click: validate the current step
  useEffect(() => {
    const off = mainButton.onClick.ifAvailable(() => {
      if (currentFormStep === 0) {
        if (!isValidAmount(form.getFieldValue("amount"))) {
          setShowAmountError(true);
          return hapticFeedback.notificationOccurred("warning");
        }
        setShowAmountError(false);
        hapticFeedback.notificationOccurred("success");
        return navigate({
          search: (prev) => ({ ...prev, currentFormStep: 1 }),
        });
      }
      if (!form.getFieldValue("counterpartyId")) {
        return hapticFeedback.notificationOccurred("warning");
      }
      form.handleSubmit();
    });
    return () => off?.();
  }, [currentFormStep, form, navigate]);

  // Secondary « Back on step 1, hidden otherwise; clean up on unmount
  useEffect(() => {
    const show = currentFormStep > 0;
    secondaryButton.setParams.ifAvailable({
      isVisible: show,
      isEnabled: show,
      text: "« Back",
    });
    const off = secondaryButton.onClick.ifAvailable(() => {
      navigate({ search: (prev) => ({ ...prev, currentFormStep: 0 }) });
    });
    return () => off?.();
  }, [currentFormStep, navigate]);

  // Reset main-button styling on unmount. Keyed on tButtonColor so the
  // reset uses the current theme; a theme change re-runs this cleanup, but
  // the per-step effect above re-shows the button in the same flush.
  useEffect(
    () => () => {
      mainButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
        backgroundColor: tButtonColor,
        hasShineEffect: false,
      });
    },
    [tButtonColor]
  );

  // Unmount only: nothing re-shows « Back after a theme change, so this
  // must not depend on tButtonColor.
  useEffect(
    () => () => {
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
    },
    []
  );

  return (
    <div className="flex flex-col gap-2.5 pb-16">
      <section className="flex w-full flex-col items-center justify-center px-4">
        <Steps
          count={STEP_TITLES.length}
          progress={currentFormStep + 1}
          className="w-full"
        />
        <div className="flex w-full justify-evenly px-2">
          {STEP_TITLES.map((title, index) => (
            <Subheadline
              key={title}
              level="2"
              weight={index === currentFormStep ? "2" : "3"}
              className={cn(
                "w-1/2 text-center",
                index !== currentFormStep && "text-gray-500/50"
              )}
            >
              {index + 1}. {title}
            </Subheadline>
          ))}
        </div>
      </section>
      <section className="p-4">
        {currentFormStep === 0 ? (
          <PaymentAmountStep
            form={form}
            chatId={chatId}
            showAmountError={showAmountError}
          />
        ) : (
          <PaymentWhoStep form={form} chatId={chatId} />
        )}
      </section>
    </div>
  );
};

export default RecordPaymentPage;
