import { trpc } from "@/utils/trpc";
import { getRouteApi } from "@tanstack/react-router";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import {
  Cell,
  Navigation,
  Section,
  Skeleton,
} from "@telegram-apps/telegram-ui";
import { Currency } from "lucide-react";
import { useEffect } from "react";

interface ChatSettingsPageProps {
  chatId: number;
}

const routeApi = getRouteApi("/_tma/chat/$chatId_/settings");

const ChatSettingsPage = ({ chatId }: ChatSettingsPageProps) => {
  // * Hooks =======================================================================================
  const { prevCurrency, prevTab } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const trpcUtils = trpc.useUtils();

  // * Queries =====================================================================================
  const { data: dChatData, status: dChatDataStatus } =
    trpc.chat.getChat.useQuery({
      chatId,
    });
  const { data: supportedCurrencies, status: supportedCurrenciesStatus } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  // * Mutations ===================================================================================
  const updateChatMutation = trpc.chat.updateChat.useMutation({
    onMutate: ({ baseCurrency }) => {
      trpcUtils.chat.getChat.setData({ chatId }, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          baseCurrency,
        };
      });
    },
    onSuccess: () => {
      trpcUtils.chat.getChat.invalidate({ chatId });
    },
    onError: () => {
      trpcUtils.chat.getChat.setData({ chatId }, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          baseCurrency: dChatData?.baseCurrency,
        };
      });
    },
  });

  // * Effects =====================================================================================
  useEffect(() => {
    backButton.show();
    return () => {
      backButton.hide();
    };
  }, []);

  useEffect(() => {
    const offBackbutton = backButton.onClick(() => {
      navigate({
        to: "..",
        search: (prev) => ({
          ...prev,
          selectedTab: prevTab,
          selectedCurrency: prevCurrency,
          title: "👥 Group",
        }),
      });
    });
    return () => {
      offBackbutton();
    };
  }, [navigate, prevCurrency, prevTab]);

  // * Handlers ====================================================================================
  const handleCurrencyChange = (currencyCode: string) => {
    if (dChatData?.baseCurrency === currencyCode) return;

    updateChatMutation.mutate(
      {
        chatId,
        baseCurrency: currencyCode,
      },
      {
        onSuccess: ({ baseCurrency }) => {
          hapticFeedback.notificationOccurred("success");
          navigate({
            search: (prev) => ({
              ...prev,
              prevCurrency: baseCurrency,
            }),
          });
        },
        onError: () => {
          alert(`Something went wrong, try again later.`);
          hapticFeedback.notificationOccurred("error");
        },
      }
    );
  };

  return (
    <main className="px-3">
      <Section header="Currency">
        <Cell
          before={<Currency />}
          after={
            <Navigation>
              <Skeleton
                visible={
                  dChatDataStatus === "pending" ||
                  supportedCurrenciesStatus === "pending"
                }
              >
                <select
                  value={dChatData?.baseCurrency}
                  className="appearance-none focus:outline-none"
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                >
                  {supportedCurrencies?.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.flagEmoji} {currency.code}
                    </option>
                  ))}
                </select>
              </Skeleton>
            </Navigation>
          }
          multiline
        >
          Default Currency
        </Cell>
      </Section>
    </main>
  );
};

export default ChatSettingsPage;
