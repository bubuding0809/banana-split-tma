import { trpc } from "@/utils/trpc";
import { getRouteApi } from "@tanstack/react-router";
import { initData, useSignal } from "@telegram-apps/sdk-react";
import {
  Avatar,
  AvatarStack,
  Cell,
  Info,
  Modal,
  Title,
  Radio,
  Skeleton,
} from "@telegram-apps/telegram-ui";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const routeApi = getRouteApi("/_tma/chat/$chatId");

const CurrencyNavList = () => {
  const { selectedCurrency } = routeApi.useSearch();
  const tUserData = useSignal(initData.user);
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

  const { data: currencies, status: getCurrenciesStatus } =
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
                  {currencies
                    ?.filter((currency) => currency.code !== selectedCurrency)
                    .map((currency) => (
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
          ></Modal.Header>
        }
      >
        <ul className="pb-10">
          {currencies?.map((currency) => (
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
            >
              {currency.name}
            </Cell>
          ))}
        </ul>
      </Modal>
    </>
  );
};

export default CurrencyNavList;
