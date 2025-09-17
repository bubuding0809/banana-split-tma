import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Caption,
  Cell,
  Navigation,
  Skeleton,
  Text,
} from "@telegram-apps/telegram-ui";
import { type inferRouterOutputs } from "@trpc/server";
import { useMemo, useState } from "react";
import { cn } from "@utils/cn";

import { trpc } from "@/utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import {
  getBalanceColorClass,
  formatCurrencyWithCode,
} from "@/utils/financial";
import MultiCurrencyBalanceModal from "./MultiCurrencyBalanceModal";

interface BalanceEntryProps {
  balance: {
    currency: string;
    amount: number;
  };
  baseCurrency: string;
  currencyMap: Map<string, { code: string; name: string; flagEmoji: string }>;
}

const BalanceEntry = ({
  balance,
  baseCurrency,
  currencyMap,
}: BalanceEntryProps) => {
  const tSubtitleColor = useSignal(themeParams.subtitleTextColor);

  // Single hook call per component instance - always consistent!
  const { data: conversionRateData, status: conversionRateStatus } =
    trpc.currency.getCurrentRate.useQuery(
      {
        baseCurrency: baseCurrency ?? "SGD",
        targetCurrency: balance.currency ?? "SGD",
      },
      {
        enabled: !!baseCurrency && balance.currency !== baseCurrency,
      }
    );

  return (
    <div
      key={`${balance.currency}-$${balance.amount}`}
      className="relative flex gap-x-1"
    >
      <span className="z-10 size-6">
        {currencyMap.get(balance.currency)?.flagEmoji ?? "🌍"}
      </span>
      <div className="flex gap-x-1">
        <Text className={cn(getBalanceColorClass(balance.amount))}>
          {formatCurrencyWithCode(balance.amount, balance.currency)}
        </Text>
        {balance.currency !== baseCurrency && (
          <Skeleton visible={conversionRateStatus === "pending"}>
            <Caption style={{ color: tSubtitleColor }}>
              or{" "}
              {conversionRateData &&
                formatCurrencyWithCode(
                  balance.amount / conversionRateData.rate,
                  baseCurrency
                )}
            </Caption>
          </Skeleton>
        )}
      </div>
    </div>
  );
};

interface ChatBalanceCellProps {
  chatId: number;
  member: NonNullable<
    inferRouterOutputs<AppRouter>["chat"]["getChat"]
  >["members"][0] & {
    balances: {
      currency: string;
      amount: number;
    }[];
  };
  isSimplified?: boolean;
  balanceType: "debtor" | "creditor";
}

const ChatBalanceCell = ({
  chatId,
  member,
  balanceType,
}: ChatBalanceCellProps) => {
  // * Hooks ======================================================================================
  const [modalOpen, setModalOpen] = useState(false);

  // * Queries ===================================================================================
  const { data: chatData } = trpc.chat.getChat.useQuery({
    chatId,
  });

  const { data: memberInfo, isLoading: isMemberInfoLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId,
      userId: member.id,
    });

  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  // * Currency mapping ============================================================================
  const currencyMap = useMemo(() => {
    if (!supportedCurrencies) return new Map();
    return new Map(
      supportedCurrencies.map((currency) => [currency.code, currency])
    );
  }, [supportedCurrencies]);

  // * Handlers ====================================================================================
  const handleCellClick = () => {
    hapticFeedback.selectionChanged.ifAvailable();
    setModalOpen(true);
  };

  return (
    <>
      <Cell
        key={member.id}
        before={<ChatMemberAvatar userId={member.id} size={28} />}
        subhead={
          <Skeleton visible={isMemberInfoLoading}>
            {balanceType === "debtor"
              ? `${memberInfo?.user.first_name ?? "Unknown"} owes you`
              : `You owe ${memberInfo?.user.first_name ?? "Unknown"}`}
          </Skeleton>
        }
        after={<Navigation></Navigation>}
        onClick={() => handleCellClick()}
      >
        <div className="flex flex-col">
          {member.balances.map((balance) => (
            <BalanceEntry
              key={`${balance.currency}-${balance.amount}`}
              balance={balance}
              baseCurrency={chatData?.baseCurrency ?? "SGD"}
              currencyMap={currencyMap}
            />
          ))}
        </div>
      </Cell>

      <MultiCurrencyBalanceModal
        modalOpen={modalOpen}
        onOpenChange={setModalOpen}
        member={member}
        balanceType={balanceType}
        baseCurrency={chatData?.baseCurrency ?? "SGD"}
        currencyMap={currencyMap}
      />
    </>
  );
};

export default ChatBalanceCell;
