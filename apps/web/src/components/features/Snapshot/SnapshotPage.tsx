import {
  Section,
  Cell,
  Text,
  Skeleton,
  Placeholder,
  Button,
  Info,
  Title,
  Navigation,
} from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SnapshotDetailsModal from "./SnapshotDetailsModal";
import {
  backButton,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { RouterOutputs } from "@dko/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";
import { format } from "date-fns";

const routeApi = getRouteApi("/_tma/chat/$chatId_/snapshots");

// Helper function to calculate date range from expenses
const getExpenseDateRange = (
  expenses: Array<{ createdAt: Date | string }>
): string => {
  if (!expenses.length) return "No expenses";

  const dates = expenses.map((expense) => new Date(expense.createdAt));
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  const startDateStr = format(minDate, "do MMM yy");
  const endDateStr = format(maxDate, "do MMM yy");

  // If all expenses are on the same day, show only one date
  if (startDateStr === endDateStr) {
    return startDateStr;
  }

  return `${startDateStr} - ${endDateStr}`;
};

interface SnapshotPageProps {
  chatId: number;
  selectedCurrency: string;
}

const SnapshotPage = ({ chatId, selectedCurrency }: SnapshotPageProps) => {
  const navigate = routeApi.useNavigate();
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    null
  );

  const { data: snapshots, isLoading } = trpc.snapshot.getByChat.useQuery({
    chatId,
    currency: selectedCurrency,
  });
  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  const selectedCurrencyDetails = supportedCurrencies?.find(
    (c) => c.code === selectedCurrency
  );

  useEffect(() => {
    backButton.show();
    const offBackButton = backButton.onClick(() => {
      navigate({
        to: "..",
        search: (prev) => ({
          ...prev,
          selectedTab: "transaction",
          selectedCurrency,
        }),
      });
    });
    return () => {
      backButton.hide();
      offBackButton();
    };
  }, [navigate, selectedCurrency]);

  const handleSnapshotClick = (snapshotId: string) => {
    setSelectedSnapshotId(snapshotId);
  };

  const handleCloseDetails = () => {
    setSelectedSnapshotId(null);
  };

  if (isLoading) {
    return (
      <Section>
        {Array.from({ length: 3 }).map((_, index) => (
          <Cell
            key={index}
            before={
              <Skeleton visible>
                <div className="h-8 w-8 rounded-lg bg-gray-200" />
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
        <Cell before={<Title>{selectedCurrencyDetails?.flagEmoji}</Title>}>
          {selectedCurrencyDetails?.name}
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
                selectedCurrency,
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
        <Cell
          before={<Title>{selectedCurrencyDetails?.flagEmoji}</Title>}
          after={
            <Navigation>
              <Link
                to="/chat/$chatId/create-snapshot"
                params={{
                  chatId: chatId.toString(),
                }}
                search={(prev) => ({
                  ...prev,
                  selectedCurrency,
                })}
              >
                Add snapshot
              </Link>
            </Navigation>
          }
        >
          {selectedCurrencyDetails?.name}
        </Cell>

        {snapshots.map((snapshot) => (
          <SnapshotCell
            key={snapshot.id}
            snapshot={snapshot}
            onClick={handleSnapshotClick}
            selectedCurrency={selectedCurrency}
          />
        ))}
      </Section>

      {/* Details Modal */}
      {selectedSnapshotId && (
        <SnapshotDetailsModal
          snapshotId={selectedSnapshotId}
          open={!!selectedSnapshotId}
          onOpenChange={(open) => {
            if (!open) handleCloseDetails();
          }}
        />
      )}
    </>
  );
};

const SnapshotCell = ({
  snapshot,
  onClick,
  selectedCurrency,
}: {
  snapshot: RouterOutputs["snapshot"]["getByChat"][number];
  onClick: (id: string) => void;
  selectedCurrency: string;
}) => {
  const tUserData = useSignal(initData.user);
  const userId = tUserData?.id ?? 0;

  const { data: snapShotDetails, status: snapShotDetailsStatus } =
    trpc.snapshot.getDetails.useQuery({
      snapshotId: snapshot.id,
    });

  // Calculate total damage for the main user (net sum of user's share amounts)
  const userShareTotal = useMemo(() => {
    if (!snapShotDetails) return 0;

    return snapShotDetails.expenses.reduce(
      (accExpense, currExpense) =>
        accExpense +
        currExpense.shares.reduce((accShare, currShare) => {
          if (currShare.userId !== userId) {
            return accShare;
          } else {
            return accShare + (currShare.amount ?? 0);
          }
        }, 0),
      0
    );
  }, [snapShotDetails, userId]);

  return (
    <Cell
      key={snapshot.id}
      onClick={() => onClick(snapshot.id)}
      after={
        <Info type="text" subtitle={`${snapshot.expenses.length} Expenses`}>
          <Skeleton visible={snapShotDetailsStatus === "pending"}>
            <Text weight="3" className="text-red-600">
              {formatCurrencyWithCode(userShareTotal, selectedCurrency)}
            </Text>
          </Skeleton>
        </Info>
      }
      description={getExpenseDateRange(snapshot.expenses)}
    >
      <Text weight="2">{snapshot.title}</Text>
    </Cell>
  );
};

export default SnapshotPage;
