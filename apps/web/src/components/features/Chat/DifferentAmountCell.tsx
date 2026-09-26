import { useNavigate } from "@tanstack/react-router";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { Cell, Navigation, Text } from "@telegram-apps/telegram-ui";
import { Pencil } from "lucide-react";
import type { PaymentDirection } from "../Payment/recordPayment";

interface DifferentAmountCellProps {
  chatId: number;
  direction: PaymentDirection;
  counterpartyId: number;
  amount: number;
  currency: string;
}

/**
 * Opens the record-payment form prefilled with the current counterparty and
 * balance, so the user can adjust the amount before submitting instead of
 * being locked into the exact "You owe" / "owes you" figure.
 */
export function DifferentAmountCell({
  chatId,
  direction,
  counterpartyId,
  amount,
  currency,
}: DifferentAmountCellProps) {
  const navigate = useNavigate();
  return (
    <Cell
      before={<Pencil size={20} className="text-zinc-400" />}
      after={<Navigation />}
      onClick={() => {
        hapticFeedback.impactOccurred.ifAvailable("light");
        navigate({
          to: "/chat/$chatId/record-payment",
          params: { chatId: chatId.toString() },
          search: {
            prevTab: "balance",
            currentFormStep: 0,
            direction,
            counterpartyId,
            amount,
            currency,
            title: "💸 Record payment",
          },
        });
      }}
    >
      <Text weight="2">
        {direction === "paid"
          ? "Pay a different amount"
          : "Received a different amount"}
      </Text>
    </Cell>
  );
}

export default DifferentAmountCell;
