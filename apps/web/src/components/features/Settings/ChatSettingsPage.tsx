import { trpc } from "@/utils/trpc";
import { getRouteApi } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  ButtonCell,
  Cell,
  Navigation,
  Section,
  Skeleton,
  Text,
} from "@telegram-apps/telegram-ui";
import { DollarSign, Phone, X } from "lucide-react";
import { useEffect, useCallback, useState } from "react";
import { useRequestContact } from "@/hooks";

interface ChatSettingsPageProps {
  chatId: number;
}

const routeApi = getRouteApi("/_tma/chat/$chatId_/settings");

const ChatSettingsPage = ({ chatId }: ChatSettingsPageProps) => {
  // * Hooks =======================================================================================
  const { prevCurrency, prevTab } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const trpcUtils = trpc.useUtils();
  const tUserData = useSignal(initData.user);
  const { requestContactInfo, isSupported } = useRequestContact();
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;

  // * Queries =====================================================================================
  const { data: dChatData, status: dChatDataStatus } =
    trpc.chat.getChat.useQuery({
      chatId,
    });
  const { data: supportedCurrencies, status: supportedCurrenciesStatus } =
    trpc.currency.getSupportedCurrencies.useQuery({});
  const { data: userData } = trpc.user.getUser.useQuery(
    {
      userId,
    },
    { enabled: userId !== 0 }
  );

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

  const updateUserMutation = trpc.user.updateUser.useMutation({
    onMutate: ({ phoneNumber }) => {
      trpcUtils.user.getUser.setData({ userId }, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phoneNumber:
            phoneNumber !== undefined ? phoneNumber : prev.phoneNumber,
        };
      });
    },
    onSuccess: () => {
      trpcUtils.user.getUser.invalidate({ userId });
    },
    onError: () => {
      trpcUtils.user.getUser.setData({ userId }, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phoneNumber: userData?.phoneNumber ?? null,
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
      hapticFeedback.notificationOccurred("success");
      navigate({
        to: "..",
        search: (prev) => ({
          ...prev,
          selectedTab: prevTab,
          selectedCurrency: prevCurrency,
          title: "",
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

  const handleAddPhoneNumber = useCallback(async () => {
    if (!isSupported) return;

    try {
      setIsUpdatingUser(true);
      const phoneNumber = await requestContactInfo();

      if (phoneNumber && userId) {
        await updateUserMutation.mutateAsync({
          userId,
          phoneNumber,
        });
        hapticFeedback.notificationOccurred("success");
      }
    } catch (err) {
      console.error("Failed to update phone number:", err);
      hapticFeedback.notificationOccurred("error");
    } finally {
      setIsUpdatingUser(false);
    }
  }, [isSupported, requestContactInfo, userId, updateUserMutation]);

  const handleRemovePhoneNumber = useCallback(async () => {
    try {
      setIsUpdatingUser(true);
      await updateUserMutation.mutateAsync({
        userId,
        phoneNumber: null,
      });
      hapticFeedback.notificationOccurred("success");
    } catch (err) {
      console.error("Failed to remove phone number:", err);
      hapticFeedback.notificationOccurred("error");
    } finally {
      setIsUpdatingUser(false);
    }
  }, [userId, updateUserMutation]);

  return (
    <main className="px-3">
      <Section header="Personal Information">
        <Cell
          onClick={() => !userData?.phoneNumber && handleAddPhoneNumber()}
          before={<Phone size={20} />}
          after={
            userData?.phoneNumber ? (
              <Text>{userData?.phoneNumber}</Text>
            ) : (
              <Navigation>
                <Text className="text-gray-500">Add</Text>
              </Navigation>
            )
          }
        >
          Phone Number
        </Cell>

        {userData?.phoneNumber ? (
          <ButtonCell
            before={<X size={20} />}
            onClick={handleRemovePhoneNumber}
            disabled={isUpdatingUser}
          >
            {isUpdatingUser ? "Removing..." : "Remove Phone Number"}
          </ButtonCell>
        ) : isSupported ? null : (
          <Cell>
            <Text className="text-sm text-gray-500">
              Phone number sharing not supported in this version of Telegram
            </Text>
          </Cell>
        )}
      </Section>

      <Section header="Currency">
        <Cell
          before={<DollarSign size={20} />}
          Component="label"
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
