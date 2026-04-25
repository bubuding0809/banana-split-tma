import {
  Avatar,
  AvatarStack,
  Blockquote,
  Cell,
  IconButton,
  Info,
  Modal,
  Section,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  ArrowLeftRight,
  ChevronRight,
  ChevronsUpDown,
  LoaderCircle,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import CurrencySelectionModal from "@/components/ui/CurrencySelectionModal";
import { trpc } from "@/utils/trpc";

interface Props {
  chatId: number;
  userId: number;
}

export default function ConvertCurrenciesCell({ chatId, userId }: Props) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const trpcUtils = trpc.useUtils();

  const [convertFromCurrency, setConvertFromCurrency] = useState<string | null>(
    null
  );
  const [targetCurrencyModalOpen, setTargetCurrencyModalOpen] = useState(false);

  // * Queries ==================================================================================
  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });
  const { data: currencieswithBalance, status: currenciesWithBalanceStatus } =
    trpc.currency.getCurrenciesWithBalance.useQuery({
      userId,
      chatId,
    });

  // * Mutations ================================================================================
  const convertCurrencyMutation = trpc.expense.convertCurrencyBulk.useMutation({
    onSuccess: () => {
      // Refetch currencies to update balances
      trpcUtils.currency.getCurrenciesWithBalance.invalidate({
        userId,
        chatId,
      });
      trpcUtils.expense.getAllExpensesByChat.invalidate({ chatId });
      trpcUtils.settlement.getAllSettlementsByChat.invalidate({ chatId });
      hapticFeedback.notificationOccurred("success");
      setConvertFromCurrency(null);
    },
    onError: (error) => {
      hapticFeedback.notificationOccurred("error");
      alert(`❌ Conversion failed: ${error.message}`);
      setConvertFromCurrency(null);
    },
  });

  const handleSelectFromCurrency = (fromCurrency: string) => {
    hapticFeedback.impactOccurred("light");
    setConvertFromCurrency(fromCurrency);
    setTargetCurrencyModalOpen(true);
  };

  const handleTargetCurrencySelect = (targetCurrency: string) => {
    setTargetCurrencyModalOpen(false);
    if (convertFromCurrency) {
      handleConvertCurrency(convertFromCurrency, targetCurrency);
    }
    // convertFromCurrency is cleared in mutation onSuccess/onError
    // or in handleConvertCurrency if user cancels the confirm dialog
  };

  const handleConvertCurrency = (fromCurrency: string, toCurrency: string) => {
    if (fromCurrency === toCurrency) {
      setConvertFromCurrency(null);
      return;
    }

    const shouldConvert = confirm(
      `⚠️ Convert all ${fromCurrency} transactions to ${toCurrency}?\n\nThis action cannot be undone. All expenses and settlements in ${fromCurrency} will be converted to ${toCurrency} using current exchange rates.`
    );

    if (shouldConvert) {
      convertCurrencyMutation.mutate({
        chatId,
        fromCurrency,
        toCurrency,
        userId,
      });
    } else {
      setConvertFromCurrency(null);
    }
  };

  const foreignCurrencies = useMemo(() => {
    if (currenciesWithBalanceStatus !== "success" || !currencieswithBalance) {
      return [];
    }
    if (!dChatData?.baseCurrency) {
      return [];
    }
    return currencieswithBalance.filter(
      ({ currency }) => currency.code !== dChatData.baseCurrency
    );
  }, [
    currenciesWithBalanceStatus,
    currencieswithBalance,
    dChatData?.baseCurrency,
  ]);

  if (foreignCurrencies.length === 0) return null;

  return (
    <>
      <Modal
        dismissible={!convertCurrencyMutation.isPending}
        open={convertCurrencyMutation.isPending || undefined}
        header={
          <Modal.Header
            before={
              <Title level="2" weight="1">
                Convert currencies
              </Title>
            }
            after={
              <Modal.Close>
                <IconButton
                  size="s"
                  mode="gray"
                  onClick={() => hapticFeedback.impactOccurred("light")}
                >
                  <X
                    size={20}
                    strokeWidth={3}
                    style={{
                      color: tSubtitleTextColor,
                    }}
                  />
                </IconButton>
              </Modal.Close>
            }
          ></Modal.Header>
        }
        trigger={
          <Cell
            Component={"label"}
            before={
              <span className="rounded-lg bg-teal-400 p-1.5 dark:bg-teal-700">
                <ArrowLeftRight size={20} color="white" />
              </span>
            }
            after={
              <Info
                type="avatarStack"
                avatarStack={
                  <AvatarStack>
                    {foreignCurrencies.map((c) => (
                      <Avatar key={c.currency.code} size={28}>
                        {c.currency.flagEmoji}
                      </Avatar>
                    ))}
                  </AvatarStack>
                }
              >
                <ChevronsUpDown size={20} />
              </Info>
            }
          >
            Convert currencies
          </Cell>
        }
      >
        <div className="flex max-h-[70vh] min-h-40 flex-col gap-y-2 pb-20">
          <div className="px-4">
            <Blockquote>
              {`Select a foreign currency to convert, then choose which currency to convert it to`}
            </Blockquote>
          </div>
          <Section>
            {foreignCurrencies.map((c) => (
              <Cell
                disabled={convertCurrencyMutation.isPending}
                onClick={() => handleSelectFromCurrency(c.currency.code)}
                key={c.currency.code}
                Component={"label"}
                before={<Text>{c.currency.flagEmoji}</Text>}
                after={
                  convertCurrencyMutation.isPending &&
                  convertFromCurrency === c.currency.code ? (
                    <LoaderCircle size={20} className="animate-spin" />
                  ) : (
                    <ChevronRight size={20} color="gray" />
                  )
                }
              >
                {convertCurrencyMutation.isPending &&
                convertFromCurrency === c.currency.code
                  ? "Converting..."
                  : `Convert all ${c.currency.code}`}
              </Cell>
            ))}
          </Section>
        </div>
      </Modal>

      {/* Target currency selection modal for conversion */}
      <CurrencySelectionModal
        open={targetCurrencyModalOpen}
        onOpenChange={(open) => {
          setTargetCurrencyModalOpen(open);
          if (!open && !convertCurrencyMutation.isPending) {
            setConvertFromCurrency(null);
          }
        }}
        selectedCurrency={undefined}
        onCurrencySelect={handleTargetCurrencySelect}
        featuredCurrencies={[
          dChatData?.baseCurrency ?? "SGD",
          ...(foreignCurrencies
            .map((c) => c.currency.code)
            .filter((code) => code !== convertFromCurrency) ?? []),
        ]}
        showRecentlyUsed={false}
        showOthers={true}
        footerMessage={
          convertFromCurrency
            ? `Select a currency to convert all ${convertFromCurrency} transactions to`
            : undefined
        }
      />
    </>
  );
}
