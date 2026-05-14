import { useState } from "react";
import { Cell, Section } from "@telegram-apps/telegram-ui";
import { hapticFeedback, popup } from "@telegram-apps/sdk-react";
import {
  getCurrencyName,
  getCurrencySymbol,
} from "@dko/trpc/src/utils/currencyApi";
import CurrencySelectionModal from "@/components/ui/CurrencySelectionModal";
import { trpc } from "@/utils/trpc";

interface BaseCurrencyFieldProps {
  userId: number;
  currentBaseCurrency: string;
}

export default function BaseCurrencyField({
  userId,
  currentBaseCurrency,
}: BaseCurrencyFieldProps) {
  const [open, setOpen] = useState(false);
  const trpcUtils = trpc.useUtils();

  const updateUser = trpc.user.updateUser.useMutation({
    onMutate: ({ baseCurrency }) => {
      if (!baseCurrency) return;
      trpcUtils.user.getUser.setData({ userId }, (prev) =>
        prev ? { ...prev, baseCurrency } : prev
      );
    },
    onSuccess: () => {
      hapticFeedback.notificationOccurred.ifAvailable("success");
      trpcUtils.user.getUser.invalidate({ userId });
    },
    onError: (e) => {
      hapticFeedback.notificationOccurred.ifAvailable("error");
      popup.open.ifAvailable({
        title: "Couldn't update base currency",
        message: e.message,
      });
    },
  });

  const subtitle = `${getCurrencySymbol(currentBaseCurrency)} · ${getCurrencyName(currentBaseCurrency)}`;

  const handleSelect = (code: string) => {
    setOpen(false);
    if (code === currentBaseCurrency) return;
    updateUser.mutate({ userId, baseCurrency: code });
  };

  return (
    <>
      <Section
        header="Base currency"
        footer="Used to net cross-group balances on the Balances tab."
      >
        <Cell subtitle={subtitle} onClick={() => setOpen(true)}>
          {currentBaseCurrency}
        </Cell>
      </Section>

      <CurrencySelectionModal
        open={open}
        onOpenChange={setOpen}
        selectedCurrency={currentBaseCurrency}
        userId={userId}
        onCurrencySelect={handleSelect}
      />
    </>
  );
}
