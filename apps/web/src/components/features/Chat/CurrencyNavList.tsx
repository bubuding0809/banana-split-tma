import { trpc } from "@/utils/trpc";
import { getRouteApi } from "@tanstack/react-router";
import { initData, useSignal } from "@telegram-apps/sdk-react";
import { Chip, Radio, Skeleton } from "@telegram-apps/telegram-ui";
import { useEffect } from "react";

const routeApi = getRouteApi("/_tma/chat/$chatId");

const CurrencyNavList = () => {
  const tUserData = useSignal(initData.user);
  const { selectedCurrency } = routeApi.useSearch();
  const params = routeApi.useParams();
  const navigate = routeApi.useNavigate();

  const chatId = Number(params.chatId);
  const userId = tUserData?.id ?? 0;

  // * Queries =====================================================================================
  const { data: chatData } = trpc.chat.getChat.useQuery({
    chatId: Number(chatId),
  });
  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});
  const { data: currencies, status: getCurrenciesStatus } =
    trpc.currency.getCurrenciesWithBalance.useQuery({
      userId,
      chatId,
    });

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
  };

  return (
    <nav className="no-scrollbar flex gap-x-2 overflow-x-auto px-4 py-1">
      {getCurrenciesStatus === "pending" &&
        Array.from({ length: 5 }).map((_, index) => (
          <Chip
            key={index}
            before={
              <Skeleton visible={getCurrenciesStatus === "pending"}>
                🌏
              </Skeleton>
            }
          >
            <Skeleton visible={getCurrenciesStatus === "pending"}>
              <span className="text-xl">SGD</span>
            </Skeleton>
          </Chip>
        ))}
      {currencies?.map((currency) => (
        <Chip
          key={currency.code}
          onClick={() => handleCurrencyChange(currency.code)}
          before={<span className="text-xl">{currency.flagEmoji}</span>}
          after={<Radio checked={selectedCurrency === currency.code} />}
        >
          {currency.code}
        </Chip>
      ))}
      {currencies?.length === 0 && (
        <Chip
          after={
            <span className="text-xl">
              {supportedCurrencies?.find(
                (c) => c.code === chatData?.baseCurrency
              )?.flagEmoji ?? "🌏"}
            </span>
          }
          before={
            <Radio checked={selectedCurrency === chatData?.baseCurrency} />
          }
        >
          {chatData?.baseCurrency}
        </Chip>
      )}
    </nav>
  );
};

export default CurrencyNavList;
