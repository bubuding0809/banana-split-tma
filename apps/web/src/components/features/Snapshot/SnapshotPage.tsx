import {
  Section,
  Cell,
  Text,
  Skeleton,
  Placeholder,
  Button,
  Info,
  ButtonCell,
  Snackbar,
} from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import { Aperture, Plus } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import SnapshotDetailsModal from "./SnapshotDetailsModal";
import {
  backButton,
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { RouterOutputs } from "@dko/trpc";
import { useStartParams } from "@/hooks";
import { formatCurrencyWithCode } from "@/utils/financial";
import { format } from "date-fns";

// Component to handle individual currency conversion without hooks-in-map anti-pattern
interface CurrencyConverterProps {
  currency: string;
  baseCurrency: string;
  onRateLoaded: (currency: string, rate: number | undefined) => void;
}

const CurrencyConverter = ({
  currency,
  baseCurrency,
  onRateLoaded,
}: CurrencyConverterProps) => {
  const { data, status } = trpc.currency.getCurrentRate.useQuery(
    {
      baseCurrency,
      targetCurrency: currency,
    },
    {
      enabled: !!baseCurrency && currency !== baseCurrency,
    }
  );

  useEffect(() => {
    if (status === "success") {
      onRateLoaded(currency, data?.rate);
    }
  }, [currency, data?.rate, status, onRateLoaded]);

  return null; // This component only handles data fetching
};

const routeApi = getRouteApi("/_tma/chat/$chatId_/snapshots");

// Helper function to calculate date range from expenses
const getExpenseDateRange = (
  expenses: Array<{ date: Date | string }>
): string => {
  if (!expenses.length) return "No expenses";

  const dates = expenses.map((expense) => new Date(expense.date));
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  const startDateStr = format(minDate, "d MMM yyyy");
  const endDateStr = format(maxDate, "d MMM yyyy");

  // If all expenses are on the same day, show only one date
  if (startDateStr === endDateStr) {
    return startDateStr;
  }

  return `${startDateStr} - ${endDateStr}`;
};

interface SnapshotPageProps {
  chatId: number;
}

const SnapshotPage = ({ chatId }: SnapshotPageProps) => {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const globalNavigate = useNavigate();
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tmaStartParams = useStartParams();
  const isPersonalChat = ["private", "p"].includes(
    tmaStartParams?.chat_type ?? "private"
  );

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    search.snapshotId || null
  );

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleModalClose = (open: boolean) => {
    if (!open) {
      setSelectedSnapshotId(null);
      // Remove snapshotId from URL search params
      navigate({
        search: (prev) => {
          const newSearch = { ...prev };
          delete newSearch.snapshotId;
          return newSearch;
        },
        replace: true,
      });
    }
  };

  const { data: snapshots, isLoading } = trpc.snapshot.getByChat.useQuery({
    chatId,
  });

  const { data: chatData } = trpc.chat.getChat.useQuery({
    chatId,
  });
  const baseCurrency = chatData?.baseCurrency ?? "SGD";

  useEffect(() => {
    backButton.show();
    const offBackButton = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");

      if (isPersonalChat) {
        globalNavigate({
          to: "/chat",
          search: (prev: Record<string, unknown>) => ({
            ...prev,
            selectedTab: "transaction",
            title: "",
          }),
        });
      } else {
        navigate({
          to: "..",
          search: (prev) => ({
            ...prev,
            selectedTab: "transaction",
            title: "",
          }),
        });
      }
    });
    return () => {
      backButton.hide();
      offBackButton();
    };
  }, [navigate, globalNavigate, isPersonalChat]);

  const handleSnapshotClick = (snapshotId: string) => {
    setSelectedSnapshotId(snapshotId);
  };

  if (isLoading) {
    return (
      <Section>
        {Array.from({ length: 3 }).map((_, index) => (
          <Cell
            key={index}
            before={
              <Skeleton visible>
                <div className="size-8 rounded-lg bg-gray-200" />
              </Skeleton>
            }
            after={
              <Skeleton visible>
                <div className="h-4 w-16 bg-gray-200" />
              </Skeleton>
            }
          >
            <Skeleton visible>
              <div className="h-4 w-32 bg-gray-200" />
            </Skeleton>
            <Skeleton visible>
              <div className="mt-1 h-3 w-24 bg-gray-200" />
            </Skeleton>
          </Cell>
        ))}
      </Section>
    );
  }

  if (!snapshots || snapshots.length === 0) {
    return (
      <Section>
        <Cell
          before={
            <span className="rounded-lg bg-red-600 p-1.5">
              <Aperture size={20} color="white" />
            </span>
          }
        >
          Snapshots
        </Cell>
        <Placeholder
          description="Create snapshots of your expenses to see how much you spent"
          action={
            <Link
              to="/chat/$chatId/create-snapshot"
              params={{
                chatId: chatId.toString(),
              }}
              search={(prev) => ({
                ...prev,
              })}
              className="w-full"
            >
              <Button
                before={<Plus />}
                stretched
                mode="filled"
                style={{
                  backgroundColor: tButtonColor,
                  color: tButtonTextColor,
                }}
              >
                Add Snapshot
              </Button>
            </Link>
          }
        >
          <img
            alt="Telegram sticker"
            src="https://xelene.me/telegram.gif"
            style={{
              display: "block",
              height: "120px",
              width: "120px",
            }}
          />
        </Placeholder>
      </Section>
    );
  }

  return (
    <>
      <Section>
        <ButtonCell
          onClick={() => {
            navigate({
              to: "/chat/$chatId/create-snapshot",
              params: {
                chatId: chatId.toString(),
              },
            });
            hapticFeedback.notificationOccurred("success");
          }}
          before={<Plus />}
          style={{
            color: tButtonColor,
          }}
        >
          Add Snapshots
        </ButtonCell>

        {snapshots.map((snapshot) => (
          <SnapshotCell
            key={snapshot.id}
            snapshot={snapshot}
            onClick={handleSnapshotClick}
            baseCurrency={baseCurrency}
          />
        ))}
      </Section>

      {/* Details Modal */}
      {selectedSnapshotId && (
        <SnapshotDetailsModal
          snapshotId={selectedSnapshotId}
          open={!!selectedSnapshotId}
          onOpenChange={handleModalClose}
          onShareSuccess={() =>
            setToastMessage("Snapshot shared successfully!")
          }
        />
      )}

      {toastMessage && (
        <Snackbar onClose={() => setToastMessage(null)} duration={3000}>
          {toastMessage}
        </Snackbar>
      )}
    </>
  );
};

const SnapshotCell = ({
  snapshot,
  onClick,
  baseCurrency,
}: {
  snapshot: RouterOutputs["snapshot"]["getByChat"][number];
  onClick: (id: string) => void;
  baseCurrency: string;
}) => {
  const tUserData = useSignal(initData.user);
  const userId = tUserData?.id ?? 0;

  const { data: snapShotDetails, status: snapShotDetailsStatus } =
    trpc.snapshot.getDetails.useQuery({
      snapshotId: snapshot.id,
    });

  // Extract unique currencies that differ from base currency for conversion
  const uniqueForeignCurrencies = useMemo(() => {
    if (!snapShotDetails || !baseCurrency) return [];
    const currencies = new Set(
      snapShotDetails.expenses.map((expense) => expense.currency)
    );
    // Only currencies that differ from base currency need conversion
    return Array.from(currencies).filter(
      (currency) => currency !== baseCurrency
    );
  }, [snapShotDetails, baseCurrency]);

  // State to track conversion rates
  const [conversionRates, setConversionRates] = useState<Map<string, number>>(
    new Map()
  );

  // Handle rate updates from CurrencyConverter components
  const handleRateLoaded = useCallback(
    (currency: string, rate: number | undefined) => {
      if (rate !== undefined) {
        setConversionRates((prev) => new Map(prev.set(currency, rate)));
      }
    },
    []
  );

  // Calculate total damage for the main user (net sum of user's share amounts)
  // with proper currency conversion to base currency
  const userShareTotal = useMemo(() => {
    if (!snapShotDetails || !baseCurrency) return 0;

    // Check if all conversion rates are loaded
    const allRatesLoaded = uniqueForeignCurrencies.every((currency) =>
      conversionRates.has(currency)
    );
    if (uniqueForeignCurrencies.length > 0 && !allRatesLoaded) {
      return null; // Return null to indicate loading state
    }

    return snapShotDetails.expenses.reduce((accExpense, currExpense) => {
      return (
        accExpense +
        currExpense.shares.reduce((accShare, currShare) => {
          if (currShare.userId !== userId) return accShare;

          const shareAmount = currShare.amount ?? 0;
          const expenseCurrency = currExpense.currency;

          // Convert to base currency if needed
          if (expenseCurrency === baseCurrency) {
            return accShare + shareAmount;
          } else {
            const rate = conversionRates.get(expenseCurrency);
            if (!rate) return accShare; // Skip if rate not available
            return accShare + shareAmount / rate; // Convert to base currency
          }
        }, 0)
      );
    }, 0);
  }, [
    snapShotDetails,
    userId,
    baseCurrency,
    uniqueForeignCurrencies,
    conversionRates,
  ]);

  return (
    <>
      {/* CurrencyConverter components for each unique foreign currency */}
      {uniqueForeignCurrencies.map((currency) => (
        <CurrencyConverter
          key={currency}
          currency={currency}
          baseCurrency={baseCurrency}
          onRateLoaded={handleRateLoaded}
        />
      ))}

      <Cell
        key={snapshot.id}
        onClick={() => onClick(snapshot.id)}
        after={
          <Info type="text" subtitle={`${snapshot.expenses.length} Expenses`}>
            <Skeleton
              visible={
                snapShotDetailsStatus === "pending" || userShareTotal === null
              }
            >
              <Text weight="3" className="text-red-600">
                {userShareTotal === null
                  ? "Loading..."
                  : formatCurrencyWithCode(userShareTotal, baseCurrency)}
              </Text>
            </Skeleton>
          </Info>
        }
        description={getExpenseDateRange(snapshot.expenses)}
      >
        <Text weight="2">{snapshot.title}</Text>
      </Cell>
    </>
  );
};

export default SnapshotPage;
