// T12 placeholder — T13 replaces with the full implementation.
import { Modal } from "@telegram-apps/telegram-ui";

interface Group {
  chatId: number;
  chatTitle: string;
  currency: string;
  nativeNet: number;
  baseNet: number;
}

interface Counterparty {
  userId: number;
  firstName: string;
  lastName: string | null;
  hasStartedBot: boolean;
  totalBaseNet: number;
  groups: Group[];
}

interface Props {
  open: boolean;
  counterparty: Counterparty | null;
  baseCurrency: string;
  ratesAsOf: Date | null;
  onOpenChange: (open: boolean) => void;
  onAfterMutate: () => void;
}

export function CounterpartyBalanceSheet({ open, onOpenChange }: Props) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div />
    </Modal>
  );
}
