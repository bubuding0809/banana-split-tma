import {
  Modal,
  Title,
  Cell,
  Section,
  Caption,
  Text,
  IconButton,
  Skeleton,
  Info,
  Placeholder,
  Button,
} from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import {
  hapticFeedback,
  themeParams,
  useSignal,
  popup,
  secondaryButton,
  initData,
} from "@telegram-apps/sdk-react";
import { X, TrendingDown, RefreshCcw, Pencil } from "lucide-react";
import { formatCurrencyWithCode } from "@/utils/financial";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { useCallback, useRef, useEffect, useMemo, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { cn } from "@/utils/cn";
import { useNavigate } from "@tanstack/react-router";
import { compareDatesDesc } from "@/utils/date";
import { compareTransactions } from "@/utils/transactionHelpers";

interface SnapshotDetailsModalProps {
  snapshotId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SnapshotDetailsModal = ({
  snapshotId,
  open,
  onOpenChange,
}: SnapshotDetailsModalProps) => {
  const trpcUtils = trpc.useUtils();
  const navigate = useNavigate();
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tDesctructiveTextColor = useSignal(themeParams.destructiveTextColor);
  const tUserData = useSignal(initData.user);
  const offSecondaryButtonClickRef = useRef<VoidFunction | undefined>(
    undefined
  );
  const expenseListParentRef = useRef<HTMLDivElement>(null);

  const userId = tUserData?.id ?? 0;

  // * Effects =====================================================================================
  // Cleanup secondary button when the component unmounts
  useEffect(() => {
    return () => {
      secondaryButton.setParams({
        isVisible: false,
        isEnabled: false,
      });

      offSecondaryButtonClickRef.current?.();
    };
  }, []);

  // * Queries =====================================================================================
  const {
    data: snapShotDetails,
    status: snapShotDetailsStatus,
    error,
  } = trpc.snapshot.getDetails.useQuery(
    {
      snapshotId,
    },
    {
      enabled: open,
    }
  );

  useEffect(() => {
    if (error?.data?.code === "NOT_FOUND") {
      if (popup.isSupported()) {
        popup.open({
          title: "Snapshot Not Found",
          message: "This snapshot has been deleted or does not exist.",
          buttons: [{ type: "ok", id: "ok" }],
        });
      }
      onOpenChange(false);
    }
  }, [error, onOpenChange]);

  const { data: chatData } = trpc.chat.getChat.useQuery(
    {
      chatId: snapShotDetails?.chatId ?? 0,
    },
    {
      enabled: open && !!snapShotDetails?.chatId,
    }
  );
  const baseCurrency = chatData?.baseCurrency ?? "SGD";

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

  // Query conversion rates for all foreign currencies using bulk endpoint
  const { data: multipleRatesData, status: multipleRatesStatus } =
    trpc.currency.getMultipleRates.useQuery(
      {
        baseCurrency: baseCurrency ?? "SGD",
        targetCurrencies: uniqueForeignCurrencies,
      },
      {
        enabled: open && !!baseCurrency && uniqueForeignCurrencies.length > 0,
      }
    );

  // * Mutations ===================================================================================
  const deleteSnapshotMutation = trpc.snapshot.delete.useMutation({
    onSuccess: () => {
      trpcUtils.snapshot.getByChat.invalidate();
      hapticFeedback.notificationOccurred("success");
      onOpenChange(false);
    },
    onError: (error) => {
      hapticFeedback.notificationOccurred("error");
      console.error("Failed to delete snapshot:", error);
    },
  });

  // * Handlers ====================================================================================
  const handleEdit = useCallback(() => {
    if (!snapShotDetails) return;

    hapticFeedback.impactOccurred("light");
    onOpenChange(false);
    navigate({
      to: "/chat/$chatId/edit-snapshot/$snapshotId",
      params: {
        chatId: snapShotDetails.chatId.toString(),
        snapshotId,
      },
      search: {
        prevTab: "transaction",
        title: "Edit Snapshot",
      },
    });
  }, [snapShotDetails, snapshotId, navigate, onOpenChange]);

  const handleDelete = useCallback(async () => {
    const action = await popup.open.ifAvailable({
      title: "Delete Snapshot?",
      message:
        "This action cannot be undone. The snapshot will be permanently removed.",
      buttons: [
        {
          type: "destructive",
          text: "Delete",
          id: "delete-snapshot",
        },
        {
          type: "cancel",
        },
      ],
    });

    if (action === "delete-snapshot") {
      secondaryButton.setParams({
        isLoaderVisible: true,
        isEnabled: false,
      });

      try {
        await deleteSnapshotMutation.mutateAsync({
          snapshotId,
        });
      } catch (error) {
        console.log("Error deleting snapshot %o", error);
      } finally {
        secondaryButton.setParams({
          isLoaderVisible: false,
          isEnabled: true,
        });
      }
    }
  }, [deleteSnapshotMutation, snapshotId]);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      secondaryButton.setParams({
        text: "Delete",
        isVisible: true,
        isEnabled: true,
        textColor: tDesctructiveTextColor,
      });
      offSecondaryButtonClickRef.current =
        secondaryButton.onClick(handleDelete);
    } else {
      secondaryButton.setParams({
        isVisible: false,
        isEnabled: false,
        textColor: tButtonColor,
      });
      offSecondaryButtonClickRef.current?.();
    }

    onOpenChange(open);
  };

  // Calculate total damage for the main user (net sum of user's share amounts)
  // with proper currency conversion to base currency
  const userShareTotal = useMemo(() => {
    if (!snapShotDetails || !baseCurrency) return 0;

    // Check if conversion rates are loaded (for foreign currencies)
    if (
      uniqueForeignCurrencies.length > 0 &&
      multipleRatesStatus !== "success"
    ) {
      return null; // Return null to indicate loading state
    }

    // Use the rates from the bulk query
    const rateMap = multipleRatesData?.rates || {};

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
            const rateInfo = rateMap[expenseCurrency];
            if (!rateInfo) return accShare; // Skip if rate not available
            return accShare + shareAmount / rateInfo.rate; // Convert to base currency
          }
        }, 0)
      );
    }, 0);
  }, [
    snapShotDetails,
    userId,
    baseCurrency,
    uniqueForeignCurrencies.length,
    multipleRatesStatus,
    multipleRatesData?.rates,
  ]);

  const displayExpenses = useMemo(() => {
    if (!snapShotDetails?.expenses) return [];

    return snapShotDetails.expenses
      .sort((a, b) => compareTransactions(a, b, "date", compareDatesDesc))
      .filter((expense) =>
        expense.shares.find((s: { userId: number }) => s.userId === userId)
      );
  }, [snapShotDetails?.expenses, userId]);

  // Setup virtualizer for expense list
  const virtualizer = useVirtualizer({
    count: displayExpenses.length,
    getScrollElement: () => expenseListParentRef.current,
    estimateSize: (index) => {
      const expense = displayExpenses[index];
      if (!expense) return 90;
      // Base height for expense cells in modal
      // Account for longer descriptions
      let baseHeight = 90;
      if (expense.description && expense.description.length > 50) {
        baseHeight += 20;
      }
      return baseHeight;
    },
    overscan: 3,
    getItemKey: (index) => displayExpenses[index]?.id ?? index,
  });

  if (snapShotDetailsStatus === "pending") {
    return (
      <Modal open={open} onOpenChange={handleOpenChange}>
        <div className="h-[70vh]">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} visible>
                <div className="h-16 w-full rounded bg-gray-200" />
              </Skeleton>
            ))}
          </div>
        </div>
      </Modal>
    );
  }

  if (snapShotDetailsStatus === "error") {
    return (
      <Modal open={open} onOpenChange={handleOpenChange}>
        <div className="h-[70vh]">
          <Placeholder
            header="Something went wrong loading snapshot"
            description="You can try again later or reload the page now"
            action={
              <Button
                stretched
                before={<RefreshCcw />}
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            }
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
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      header={
        <Modal.Header
          before={
            <Title level="3" weight="1">
              Snapshot Details
            </Title>
          }
          after={
            <div className="flex items-center gap-2">
              <IconButton
                size="s"
                mode="gray"
                onClick={handleEdit}
                className="p-1"
              >
                <Pencil
                  size={20}
                  strokeWidth={3}
                  style={{ color: tButtonColor }}
                />
              </IconButton>
              <Modal.Close>
                <IconButton size="s" mode="gray">
                  <X
                    size={20}
                    strokeWidth={3}
                    style={{ color: tSubtitleTextColor }}
                  />
                </IconButton>
              </Modal.Close>
            </div>
          }
        />
      }
    >
      <div className="max-h-[80vh]">
        {/* Header Information */}
        <Section>
          <Cell
            subhead={`By ${snapShotDetails.creator.firstName}`}
            before={
              <ChatMemberAvatar userId={snapShotDetails.creator.id} size={48} />
            }
            after={
              <Info type="text" subtitle="Created">
                {format(new Date(snapShotDetails.createdAt), "dd/MM/yy")}
              </Info>
            }
            subtitle={`${snapShotDetails.expenses.length} expenses`}
          >
            <Text weight="2" className="text-lg">
              {snapShotDetails.title}
            </Text>
          </Cell>
        </Section>

        {/* Total Damage for Main User */}
        {userId &&
          (userShareTotal === null ||
            (userShareTotal !== null && userShareTotal > 0)) && (
            <Section header="How much did you spend?" className="mt-4">
              <Cell
                before={
                  <span className="rounded-lg bg-red-500 p-1.5">
                    <TrendingDown size={20} color="white" />
                  </span>
                }
                after={
                  <Info type="text" subtitle="Total">
                    {userShareTotal === null ? (
                      <Skeleton visible>
                        <Text weight="3" className="text-lg text-red-600">
                          Loading...
                        </Text>
                      </Skeleton>
                    ) : (
                      <Text weight="3" className="text-lg text-red-600">
                        {formatCurrencyWithCode(userShareTotal, baseCurrency)}
                      </Text>
                    )}
                  </Info>
                }
                description="Net sum of your expense shares"
              >
                <Text weight="3">You spent</Text>
              </Cell>
            </Section>
          )}

        {/* Expenses List */}
        <Section header="Included Expenses" className="mt-4">
          <div
            ref={expenseListParentRef}
            className="h-[40vh] overflow-auto"
            style={{
              contain: "strict",
              scrollbarWidth: "thin",
            }}
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const expense = displayExpenses[virtualItem.index];
                if (!expense) return null;

                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <SnapshotExpenseCell expense={expense} userId={userId} />
                  </div>
                );
              })}
            </div>
          </div>
        </Section>
      </div>
    </Modal>
  );
};

// Type definition for expense from snapshot details
type SnapshotExpense = {
  id: string;
  chatId: number;
  creatorId: number;
  payerId: number;
  description: string;
  amount: number;
  currency: string;
  date: Date;
  createdAt: Date;
  payer: {
    id: number;
    firstName: string;
  };
  shares: {
    userId: number;
    amount: number | null;
  }[];
};

// Memoized expense cell component for virtualization
const SnapshotExpenseCell = memo(
  ({ expense, userId }: { expense: SnapshotExpense; userId: number }) => {
    return (
      <Cell
        className={cn(
          !expense.shares.find(
            (s: { userId: number }) => s.userId === userId
          ) && "bg-neutral-100 dark:bg-neutral-700"
        )}
        before={<ChatMemberAvatar userId={expense.payerId} size={48} />}
        subhead={
          <Caption weight="1" level="1">
            {expense.payer.firstName} spent
          </Caption>
        }
        description={expense.description}
        after={
          <Info
            avatarStack={
              <Info type="text">
                <div className="flex flex-col items-end gap-1.5">
                  <Caption className="w-max" weight="2">
                    {format(new Date(expense.date), "d MMM yyyy")}
                  </Caption>
                  <Text
                    weight="3"
                    className={cn(
                      expense.shares.find(
                        (s: { userId: number }) => s.userId === userId
                      )
                        ? "text-red-600"
                        : "text-gray-600"
                    )}
                  >
                    {formatCurrencyWithCode(
                      expense.shares.find(
                        (s: { userId: number }) => s.userId === userId
                      )?.amount,
                      expense.currency
                    )}
                  </Text>
                  <Caption className="w-max">
                    {expense.shares.find(
                      (s: { userId: number }) => s.userId === userId
                    )
                      ? "Share"
                      : "Unrelated"}
                  </Caption>
                </div>
              </Info>
            }
            type="avatarStack"
          />
        }
      >
        {formatCurrencyWithCode(expense.amount, expense.currency)}
      </Cell>
    );
  }
);

SnapshotExpenseCell.displayName = "SnapshotExpenseCell";

export default SnapshotDetailsModal;
