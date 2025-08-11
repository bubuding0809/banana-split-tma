import AvatarStackTruncated from "@/components/ui/AvatarStackTruncated";
import { trpc } from "@/utils/trpc";
import { getRouteApi } from "@tanstack/react-router";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  Cell,
  Info,
  Modal,
  Title,
  Radio,
  Skeleton,
  Placeholder,
  Section,
  ButtonCell,
} from "@telegram-apps/telegram-ui";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo } from "react";

const routeApi = getRouteApi("/_tma/chat/$chatId");

interface CurrencyNavCellProps {
  modalOpen: boolean;
  onModalOpen: (open: boolean) => void;
}

const CurrencyNavCell = ({ modalOpen, onModalOpen }: CurrencyNavCellProps) => {
  const { selectedCurrency } = routeApi.useSearch();
  const tUserData = useSignal(initData.user);
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const params = routeApi.useParams();
  const navigate = routeApi.useNavigate();

  const userId = tUserData?.id ?? 0;
  const chatId = Number(params.chatId);

  // * Queries =====================================================================================
  const { data: chatData } = trpc.chat.getChat.useQuery({
    chatId: Number(chatId),
  });

  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  const {
    data: currenciesWithBalance,
    status: getCurrenciesStatus,
    refetch: refetchCurrencies,
  } = trpc.currency.getCurrenciesWithBalance.useQuery({
    userId,
    chatId,
  });

  // * Mutations ==================================================================================
  const convertCurrencyMutation = trpc.expense.convertCurrencyBulk.useMutation({
    onSuccess: () => {
      // Refetch currencies to update balances
      refetchCurrencies();
      hapticFeedback.notificationOccurred("success");
      // Navigate to base currency view
      navigate({
        search: (prev) => ({
          ...prev,
          selectedCurrency: chatData?.baseCurrency,
        }),
      });
    },
    onError: (error) => {
      hapticFeedback.notificationOccurred("error");
      alert(`❌ Conversion failed: ${error.message}`);
    },
  });

  // * State =======================================================================================
  const selectedCurrencyInfo = useMemo(() => {
    if (!supportedCurrencies || !selectedCurrency) {
      return null;
    }
    return supportedCurrencies.find(
      (currency) => currency.code === selectedCurrency
    );
  }, [supportedCurrencies, selectedCurrency]);

  const baseCurrency = useMemo(() => {
    if (!chatData || !supportedCurrencies) {
      return null;
    }
    return supportedCurrencies.find(
      (currency) => currency.code === chatData.baseCurrency
    );
  }, [chatData, supportedCurrencies]);

  // Currencies with pending debts or collectables
  const pendingCurrencies = useMemo(() => {
    if (!currenciesWithBalance) {
      return [];
    }

    return [
      ...(baseCurrency
        ? [
            {
              code: baseCurrency.code,
              name: baseCurrency.name,
              flagEmoji: baseCurrency.flagEmoji,
            },
          ]
        : []),
      ...currenciesWithBalance
        .filter(
          ({ creditors, debtors }) => creditors.length > 0 || debtors.length > 0
        )
        .filter(({ currency }) => currency.code !== chatData?.baseCurrency)
        .map(({ currency }) => ({
          code: currency.code,
          name: currency.name,
          flagEmoji: currency.flagEmoji,
        })),
    ];
  }, [baseCurrency, chatData?.baseCurrency, currenciesWithBalance]);

  // Currencies without any debts or collectables
  const settledCurrencies = useMemo(() => {
    if (!currenciesWithBalance) {
      return [];
    }
    return currenciesWithBalance
      .filter(({ currency }) => currency.code !== chatData?.baseCurrency)
      .filter(
        ({ creditors, debtors }) =>
          creditors.length === 0 && debtors.length === 0
      );
  }, [chatData?.baseCurrency, currenciesWithBalance]);

  // Avatar stack should show all currencies with history, excluding the selected currency
  const avatarStackCurrencies = useMemo(() => {
    if (!currenciesWithBalance) {
      return [];
    }

    // Ensure group's base currency is always included
    let currencies = [];
    const baseCurrencyWithBalance = currenciesWithBalance?.find(
      ({ currency }) => currency.code === chatData?.baseCurrency
    );
    if (baseCurrencyWithBalance) {
      currencies = [
        ...currenciesWithBalance.filter(
          ({ currency }) => currency.code !== chatData?.baseCurrency
        ),
        baseCurrencyWithBalance,
      ];
    } else {
      currencies = [
        ...currenciesWithBalance.filter(
          ({ currency }) => currency.code !== chatData?.baseCurrency
        ),
        {
          currency: {
            code: baseCurrency?.code ?? "SGD",
            name: baseCurrency?.name ?? "Singapore Dollar",
            flagEmoji: baseCurrency?.flagEmoji ?? "🇸🇬",
          },
          creditors: [],
          debtors: [],
        },
      ];
    }
    return currencies.filter(
      ({ currency }) => currency.code !== selectedCurrency
    );
  }, [
    baseCurrency?.code,
    baseCurrency?.flagEmoji,
    baseCurrency?.name,
    chatData?.baseCurrency,
    currenciesWithBalance,
    selectedCurrency,
  ]);

  // Default selected currency to base currency
  useEffect(() => {
    if (chatData && chatData.baseCurrency && selectedCurrency === undefined) {
      navigate({
        search: (prev) => ({
          ...prev,
          selectedCurrency: chatData.baseCurrency,
        }),
      });
    }
  }, [chatData, navigate, selectedCurrency]);

  const handleCurrencyChange = (currencyCode: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedCurrency: currencyCode,
        selectedTab: "balance",
      }),
    });
    onModalOpen(false);
  };

  const handleConvertCurrency = () => {
    if (
      !selectedCurrency ||
      !chatData?.baseCurrency ||
      selectedCurrency === chatData.baseCurrency
    ) {
      return;
    }

    const shouldConvert = confirm(
      `⚠️ Convert all ${selectedCurrency} transactions to ${chatData.baseCurrency}?\n\nThis action cannot be undone. All expenses and settlements in ${selectedCurrency} will be converted to ${chatData.baseCurrency} using current exchange rates.`
    );

    if (shouldConvert) {
      convertCurrencyMutation.mutate({
        chatId,
        fromCurrency: selectedCurrency,
        toCurrency: chatData.baseCurrency,
        userId,
      });
    }
  };

  return (
    <>
      <div className="px-2">
        <Cell
          before={
            <Skeleton visible={getCurrenciesStatus === "pending"}>
              <span className="text-3xl">
                {selectedCurrencyInfo?.flagEmoji ?? "🌏"}
              </span>
            </Skeleton>
          }
          subtitle={
            <Skeleton visible={getCurrenciesStatus === "pending"}>
              {selectedCurrencyInfo?.code ?? "SGD"}
            </Skeleton>
          }
          after={
            <Info
              type="avatarStack"
              avatarStack={
                <AvatarStackTruncated limit={4}>
                  {avatarStackCurrencies.map(({ currency }) => (
                    <Avatar key={currency.code} size={28}>
                      {currency.flagEmoji}
                    </Avatar>
                  ))}
                </AvatarStackTruncated>
              }
            >
              <RefreshCw size={20} />
            </Info>
          }
          onClick={() => onModalOpen(true)}
        >
          <Skeleton visible={getCurrenciesStatus === "pending"}>
            {selectedCurrencyInfo?.name ?? "Singapore Dollar"}
          </Skeleton>
        </Cell>

        {selectedCurrency &&
          chatData?.baseCurrency &&
          selectedCurrency !== chatData.baseCurrency && (
            <ButtonCell
              before={<ArrowLeftRight />}
              onClick={handleConvertCurrency}
            >
              {convertCurrencyMutation.isPending
                ? "Converting..."
                : `Convert all ${selectedCurrency} to ${chatData.baseCurrency}`}
            </ButtonCell>
          )}
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={onModalOpen}
        header={
          <Modal.Header
            before={
              <Title weight="2" level="3">
                Currencies
              </Title>
            }
          />
        }
        className="pb-8"
      >
        <div className="max-h-[78vh] min-h-40 pb-10">
          <Section header="Pending currencies" className="px-3">
            {pendingCurrencies.map((currency) => (
              <Cell
                Component="label"
                key={currency.code}
                before={<Title level="1">{currency.flagEmoji}</Title>}
                subtitle={currency.code}
                after={
                  <Radio
                    value={currency.code}
                    checked={selectedCurrency === currency.code}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                  />
                }
                style={{
                  backgroundColor: tSectionBgColor,
                }}
              >
                {currency.name}
              </Cell>
            ))}
          </Section>

          {settledCurrencies?.length ? (
            <Section header="Settled currencies" className="px-3">
              {settledCurrencies.map(({ currency }) => (
                <Cell
                  Component="label"
                  key={currency.code}
                  before={<Title level="1">{currency.flagEmoji}</Title>}
                  subtitle={currency.code}
                  after={
                    <Radio
                      value={currency.code}
                      checked={selectedCurrency === currency.code}
                      onChange={(e) => handleCurrencyChange(e.target.value)}
                    />
                  }
                  style={{
                    backgroundColor: tSectionBgColor,
                  }}
                >
                  {currency.name}
                </Cell>
              ))}
            </Section>
          ) : null}

          {(!currenciesWithBalance || currenciesWithBalance.length === 0) && (
            <Placeholder
              header="No other currencies available"
              description="Create expenses in other currencies to see them here"
            >
              <img
                alt="Telegram sticker"
                src="https://xelene.me/telegram.gif"
                style={{
                  display: "block",
                  height: "144px",
                  width: "144px",
                }}
              />
            </Placeholder>
          )}
        </div>
      </Modal>
    </>
  );
};

export default CurrencyNavCell;
