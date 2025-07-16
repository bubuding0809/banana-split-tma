import { trpc } from "@/utils/trpc";
import { getRouteApi } from "@tanstack/react-router";
import { initData, themeParams, useSignal } from "@telegram-apps/sdk-react";
import {
  Avatar,
  AvatarStack,
  Cell,
  Info,
  Modal,
  Title,
  Radio,
  Skeleton,
  Placeholder,
  Section,
} from "@telegram-apps/telegram-ui";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const routeApi = getRouteApi("/_tma/chat/$chatId");

const CurrencyNavList = () => {
  const { selectedCurrency } = routeApi.useSearch();
  const tUserData = useSignal(initData.user);
  const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
  const params = routeApi.useParams();
  const navigate = routeApi.useNavigate();

  const [modalOpen, setModalOpen] = useState(false);

  const userId = tUserData?.id ?? 0;
  const chatId = Number(params.chatId);

  // * Queries =====================================================================================
  const { data: chatData } = trpc.chat.getChat.useQuery({
    chatId: Number(chatId),
  });
  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  const { data: currenciesWithBalance, status: getCurrenciesStatus } =
    trpc.currency.getCurrenciesWithBalance.useQuery({
      userId,
      chatId,
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
    if (!currenciesWithBalance || !supportedCurrencies) {
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
        .map(({ currency }) => ({
          code: currency.code,
          name: currency.name,
          flagEmoji: currency.flagEmoji,
        })),
    ];
  }, [baseCurrency, currenciesWithBalance, supportedCurrencies]);

  // Currencies without any debts or collectables
  const settledCurrencies = useMemo(() => {
    return (
      currenciesWithBalance?.filter(
        ({ creditors, debtors }) =>
          creditors.length === 0 && debtors.length === 0
      ) ?? []
    );
  }, [currenciesWithBalance]);

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
      }),
    });
    setModalOpen(false);
  };

  return (
    <>
      <div className="px-2">
        <Cell
          before={
            <Skeleton visible={getCurrenciesStatus === "pending"}>
              <Title level="1">{selectedCurrencyInfo?.flagEmoji ?? "🌏"}</Title>
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
                <AvatarStack>
                  {currenciesWithBalance
                    ?.filter(
                      ({ currency }) => currency.code !== selectedCurrency
                    )
                    .map(({ currency }) => (
                      <Avatar key={currency.code} size={28}>
                        {currency.flagEmoji}
                      </Avatar>
                    )) || []}
                </AvatarStack>
              }
            >
              <RefreshCw />
            </Info>
          }
          onClick={() => setModalOpen(true)}
        >
          <Skeleton visible={getCurrenciesStatus === "pending"}>
            {selectedCurrencyInfo?.name ?? "Singapore Dollar"}
          </Skeleton>
        </Cell>
      </div>
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        header={
          <Modal.Header
            before={
              <Title weight="2" level="3">
                Currencies
              </Title>
            }
          />
        }
      >
        <div className="pb-10">
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

export default CurrencyNavList;
