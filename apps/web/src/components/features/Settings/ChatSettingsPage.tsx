import { trpc } from "@/utils/trpc";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  ButtonCell,
  Cell,
  Navigation,
  Section,
  Skeleton,
  Switch,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  Bell,
  ChevronsUpDown,
  Phone,
  Repeat as RepeatIcon,
  X,
} from "lucide-react";
import { useEffect, useCallback, useState } from "react";
import { useRequestContact } from "@/hooks";
import CurrencySelectionModal from "@/components/ui/CurrencySelectionModal";
import RecurringRemindersSection from "./RecurringRemindersSection";
import AccessTokensSection from "./AccessTokensSection";
import UserAccessTokensSection from "./UserAccessTokensSection";
import CategoriesSection from "./CategoriesSection";

interface ChatSettingsPageProps {
  chatId: number;
}

const routeApi = getRouteApi("/_tma/chat/$chatId_/settings");

const ChatSettingsPage = ({ chatId }: ChatSettingsPageProps) => {
  // * Hooks =======================================================================================
  const { prevTab } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const globalNavigate = useNavigate();
  const trpcUtils = trpc.useUtils();
  const tUserData = useSignal(initData.user);
  const { requestContactInfo, isSupported } = useRequestContact();
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);

  // * Variables ===================================================================================
  const userId = tUserData?.id ?? 0;
  const isPrivateChat = userId === chatId;

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
    onMutate: ({
      baseCurrency,
      notifyOnExpense,
      notifyOnExpenseUpdate,
      notifyOnSettlement,
    }) => {
      trpcUtils.chat.getChat.setData({ chatId }, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          baseCurrency: baseCurrency ?? prev.baseCurrency,
          notifyOnExpense: notifyOnExpense ?? prev.notifyOnExpense,
          notifyOnExpenseUpdate:
            notifyOnExpenseUpdate ?? prev.notifyOnExpenseUpdate,
          notifyOnSettlement: notifyOnSettlement ?? prev.notifyOnSettlement,
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
          baseCurrency: dChatData?.baseCurrency ?? "SGD",
          notifyOnExpense: dChatData?.notifyOnExpense ?? true,
          notifyOnExpenseUpdate: dChatData?.notifyOnExpenseUpdate ?? true,
          notifyOnSettlement: dChatData?.notifyOnSettlement ?? true,
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

      if (isPrivateChat) {
        navigate({
          to: "/chat",
          search: (prev) => ({
            ...prev,
            title: "",
          }),
        });
      } else {
        navigate({
          to: "..",
          search: (prev) => ({
            ...prev,
            selectedTab: prevTab,
            title: "",
          }),
        });
      }
    });
    return () => {
      offBackbutton();
    };
  }, [navigate, prevTab, isPrivateChat]);

  // * Handlers ====================================================================================
  const handleCurrencyChange = (currencyCode: string) => {
    if (dChatData?.baseCurrency === currencyCode) return;

    updateChatMutation.mutate(
      {
        chatId,
        baseCurrency: currencyCode,
      },
      {
        onError: () => {
          alert(`Something went wrong, try again later.`);
          hapticFeedback.notificationOccurred("error");
        },
      }
    );
  };

  const handleNotifyOnExpenseToggle = () => {
    const newValue = !(dChatData?.notifyOnExpense ?? true);

    updateChatMutation.mutate(
      {
        chatId,
        notifyOnExpense: newValue,
      },
      {
        onError: () => {
          alert(`Something went wrong, try again later.`);
          hapticFeedback.notificationOccurred("error");
        },
        onSuccess: () => {
          hapticFeedback.notificationOccurred("success");
        },
      }
    );
  };

  const handleNotifyOnExpenseUpdateToggle = () => {
    const newValue = !(dChatData?.notifyOnExpenseUpdate ?? true);

    updateChatMutation.mutate(
      {
        chatId,
        notifyOnExpenseUpdate: newValue,
      },
      {
        onError: () => {
          alert(`Something went wrong, try again later.`);
          hapticFeedback.notificationOccurred("error");
        },
        onSuccess: () => {
          hapticFeedback.notificationOccurred("success");
        },
      }
    );
  };

  const handleNotifyOnSettlementToggle = () => {
    const newValue = !(dChatData?.notifyOnSettlement ?? true);

    updateChatMutation.mutate(
      {
        chatId,
        notifyOnSettlement: newValue,
      },
      {
        onError: () => {
          alert(`Something went wrong, try again later.`);
          hapticFeedback.notificationOccurred("error");
        },
        onSuccess: () => {
          hapticFeedback.notificationOccurred("success");
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

  // Helper function to get flag URL
  const getFlagUrl = (countryCode: string): string => {
    const normalizedCode = countryCode.toLowerCase();
    return `https://hatscripts.github.io/circle-flags/flags/${normalizedCode}.svg`;
  };

  // Get current currency info
  const currentCurrencyInfo = supportedCurrencies?.find(
    (currency) => currency.code === dChatData?.baseCurrency
  );

  return (
    <main className="px-3 pb-8">
      <Section header="Base Currency">
        <Cell
          before={
            <Avatar
              size={40}
              src={getFlagUrl(currentCurrencyInfo?.countryCode || "SGD")}
            >
              {currentCurrencyInfo?.flagEmoji || "🌏"}
            </Avatar>
          }
          subtitle={
            <Skeleton
              visible={
                dChatDataStatus === "pending" ||
                supportedCurrenciesStatus === "pending"
              }
            >
              {currentCurrencyInfo?.code || "Loading..."}
            </Skeleton>
          }
          after={<ChevronsUpDown size={20} color="gray" />}
          onClick={() => setCurrencyModalOpen(true)}
        >
          <Skeleton
            visible={
              dChatDataStatus === "pending" ||
              supportedCurrenciesStatus === "pending"
            }
          >
            {currentCurrencyInfo?.name || "Default Currency"}
          </Skeleton>
        </Cell>
      </Section>

      <CategoriesSection chatId={chatId} isPersonal={isPrivateChat} />

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
        ) : isSupported ? (
          []
        ) : (
          <Cell>
            <Text className="text-sm text-gray-500">
              Phone number sharing not supported in this version of Telegram
            </Text>
          </Cell>
        )}
      </Section>

      {!isPrivateChat && (
        <Section
          header="Notifications"
          footer="Choose which events should notify this group. Reminders you send manually are unaffected."
        >
          <Cell
            Component="label"
            before={<Bell size={20} />}
            after={
              <Switch
                checked={dChatData?.notifyOnExpense ?? true}
                onChange={handleNotifyOnExpenseToggle}
              />
            }
            onClick={handleNotifyOnExpenseToggle}
          >
            Expense added
          </Cell>
          <Cell
            Component="label"
            before={<Bell size={20} />}
            after={
              <Switch
                checked={dChatData?.notifyOnExpenseUpdate ?? true}
                onChange={handleNotifyOnExpenseUpdateToggle}
              />
            }
            onClick={handleNotifyOnExpenseUpdateToggle}
          >
            Expense updated
          </Cell>
          <Cell
            Component="label"
            before={<Bell size={20} />}
            after={
              <Switch
                checked={dChatData?.notifyOnSettlement ?? true}
                onChange={handleNotifyOnSettlementToggle}
              />
            }
            onClick={handleNotifyOnSettlementToggle}
          >
            Settlement recorded
          </Cell>
        </Section>
      )}

      {!isPrivateChat && <RecurringRemindersSection chatId={chatId} />}

      <Section header="Recurring expenses">
        <Cell
          before={<RepeatIcon size={20} />}
          after={<Navigation>Manage</Navigation>}
          onClick={() => {
            try {
              hapticFeedback.impactOccurred("light");
            } catch {}
            globalNavigate({
              to: "/chat/$chatId/recurring-expenses",
              params: { chatId: String(chatId) },
            });
          }}
        >
          Manage recurring expenses
        </Cell>
      </Section>

      {isPrivateChat ? (
        <UserAccessTokensSection />
      ) : (
        <AccessTokensSection chatId={chatId} />
      )}

      <CurrencySelectionModal
        open={currencyModalOpen}
        onOpenChange={setCurrencyModalOpen}
        selectedCurrency={dChatData?.baseCurrency}
        onCurrencySelect={handleCurrencyChange}
        featuredCurrencies={[dChatData?.baseCurrency || "SGD"]}
        showRecentlyUsed={false}
        showOthers={true}
      />
    </main>
  );
};

export default ChatSettingsPage;
