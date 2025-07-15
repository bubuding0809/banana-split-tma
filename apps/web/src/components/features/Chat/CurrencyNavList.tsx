import { trpc } from "@/utils/trpc";
import { getRouteApi } from "@tanstack/react-router";
import { initData, useSignal } from "@telegram-apps/sdk-react";
import { Chip } from "@telegram-apps/telegram-ui";
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
  const { data: currencies } = trpc.currency.getCurrenciesWithBalance.useQuery({
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

  return (
    <nav className="flex gap-x-2 overflow-x-auto">
      {currencies?.map((currency) => (
        <Chip
          key={currency.code}
          className={`px-4 py-2 ${
            selectedCurrency === currency.code
              ? "bg-blue-500 text-white"
              : "text-gray-700"
          }`}
          onClick={() => {
            navigate({
              search: (prev) => ({
                ...prev,
                selectedCurrency: currency.code,
              }),
            });
          }}
        >
          {currency.code} - {currency.name}
        </Chip>
      ))}
      {currencies?.length === 0 && (
        <span className="px-4 py-2 text-gray-500">No currencies available</span>
      )}
    </nav>
  );
};

export default CurrencyNavList;
