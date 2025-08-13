import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useMemo, memo, useState } from "react";
import { Updater } from "@tanstack/react-form";
import { RouterOutputs } from "@dko/trpc";
import {
  Cell,
  Caption,
  Info,
  Skeleton,
  Text,
  Checkbox,
  ButtonCell,
  Divider,
  Modal,
  IconButton,
  Title,
} from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import {
  useSignal,
  themeParams,
  initData,
  hapticFeedback,
} from "@telegram-apps/sdk-react";
import { formatCurrencyWithCode } from "@/utils/financial";
import { formatExpenseDateShort, formatDateKey } from "@/utils/date";
import { cn } from "@/utils/cn";
import { getRouteApi } from "@tanstack/react-router";
import { buildExpenseDateMap } from "@/utils/transactionHelpers";
import { useTransactionHighlight } from "@/hooks/useTransactionHighlight";
import { CalendarArrowUp, X } from "lucide-react";
import DateSelector from "../Chat/DateSelector";

const routeApi = getRouteApi("/_tma/chat/$chatId_/create-snapshot");

interface VirtualizedExpenseListProps {
  expenses: RouterOutputs["expense"]["getExpenseByChat"];
  selectedExpenseIds: string[];
  onExpenseToggle: (updater: Updater<string[]>) => void;
}

const VirtualizedExpenseList = ({
  expenses,
  selectedExpenseIds,
  onExpenseToggle,
}: VirtualizedExpenseListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const tUserData = useSignal(initData.user);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const userId = tUserData?.id ?? 0;

  // Jump to date modal state
  const [jumpToDateModalOpen, setJumpToDateModalOpen] = useState(false);

  // Build month grouped data for date selector (adapted for expense data)
  const monthGroupedData = useMemo(() => {
    const expenseData = buildExpenseDateMap(expenses);
    // Convert expenseIds to transactionIds to match DateSelector interface
    return expenseData.map((month) => ({
      ...month,
      dates: month.dates.map((date) => ({
        ...date,
        transactionIds: date.expenseIds, // Map expenseIds to transactionIds
      })),
    }));
  }, [expenses]);

  // Initialize transaction highlighting
  const { highlightTransactions } = useTransactionHighlight(tButtonColor);

  // Utility function to wait for virtual elements to be rendered
  const waitForVirtualElements = (
    expenseIds: string[],
    maxRetries: number = 15,
    retryDelay: number = 100
  ): Promise<string[]> => {
    return new Promise((resolve) => {
      let retryCount = 0;

      const checkElements = () => {
        const foundIds: string[] = [];

        expenseIds.forEach((id) => {
          const element = document.querySelector(
            `[data-transaction-id="${id}"]`
          );
          if (element) {
            foundIds.push(id);
          }
        });

        // If we found some elements or exceeded max retries, resolve
        if (foundIds.length > 0 || retryCount >= maxRetries) {
          resolve(foundIds);
          return;
        }

        retryCount++;
        setTimeout(() => {
          requestAnimationFrame(checkElements);
        }, retryDelay);
      };

      checkElements();
    });
  };

  // Select all handler
  const handleSelectAll = () => {
    hapticFeedback.impactOccurred("light");
    const allExpenseIds = expenses.map((expense) => expense.id);
    const isAllSelected = allExpenseIds.every((id) =>
      selectedExpenseIds.includes(id)
    );

    onExpenseToggle(() => (isAllSelected ? [] : allExpenseIds));
  };

  // Jump to date handlers
  const handleJumpToDate = () => {
    hapticFeedback.impactOccurred("light");
    setJumpToDateModalOpen(true);
  };

  const handleDateSelect = async (dateKey: string) => {
    if (!dateKey) return;

    // Find the expense IDs for this date
    let selectedDate:
      | { key: string; display: string; transactionIds: string[] }
      | undefined;

    for (const month of monthGroupedData) {
      selectedDate = month.dates.find((date) => date.key === dateKey);
      if (selectedDate) break;
    }

    if (!selectedDate || selectedDate.transactionIds.length === 0) return;

    hapticFeedback.selectionChanged();

    // Close modal
    setJumpToDateModalOpen(false);

    // Find the index of the first expense for this date
    const firstExpenseId = selectedDate.transactionIds[0];
    const firstExpenseIndex = expenses.findIndex(
      (expense) => expense.id === firstExpenseId
    );

    if (firstExpenseIndex !== -1) {
      // Scroll to the first expense of the selected date
      virtualizer.scrollToIndex(firstExpenseIndex, {
        align: "start",
        behavior: "smooth",
      });

      // Wait for virtual elements to be rendered, then highlight
      setTimeout(async () => {
        const availableIds = await waitForVirtualElements(
          selectedDate!.transactionIds
        );
        if (availableIds.length > 0) {
          highlightTransactions(availableIds, false);
        } else {
          // Fallback: Try one more time with a longer delay
          setTimeout(async () => {
            const fallbackIds = await waitForVirtualElements(
              selectedDate!.transactionIds,
              5,
              200
            );
            if (fallbackIds.length > 0) {
              highlightTransactions(fallbackIds, false);
            }
          }, 300);
        }
      }, 500); // Increased delay for scroll completion
    }
  };

  // Create virtualizer with dynamic sizing
  const virtualizer = useVirtualizer({
    count: expenses.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // More accurate estimate based on ExpenseCell content
      const expense = expenses[index];
      if (!expense) return 80;

      // Base height + account for description length
      let baseHeight = 80;
      if (expense.description && expense.description.length > 50) {
        baseHeight += 20; // Add extra height for long descriptions
      }
      return baseHeight;
    },
    overscan: 3, // Reduced overscan for better performance
    getItemKey: (index) => expenses[index]?.id ?? index,
  });

  return (
    <>
      <ButtonCell
        before={
          <Checkbox
            onClick={(e) => e.stopPropagation()}
            checked={expenses.every((expense) =>
              selectedExpenseIds.includes(expense.id)
            )}
          />
        }
        onClick={handleSelectAll}
      >
        Select all expenses
      </ButtonCell>
      <Divider />
      <div
        ref={parentRef}
        className="h-[55vh] overflow-auto"
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
            const expense = expenses[virtualItem.index];
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
                <div
                  data-transaction-id={expense.id}
                  data-date-key={formatDateKey(new Date(expense.createdAt))}
                >
                  <ExpenseCell
                    expense={expense}
                    userId={userId}
                    onExpenseToggle={onExpenseToggle}
                    isSelected={selectedExpenseIds.includes(expense.id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Divider />
      <ButtonCell
        before={<CalendarArrowUp size={20} />}
        onClick={handleJumpToDate}
      >
        Jump to date
      </ButtonCell>

      {/* Jump to date modal */}
      <Modal
        open={jumpToDateModalOpen}
        header={
          <Modal.Header
            before={
              <Title level="3" weight="1">
                Jump to date
              </Title>
            }
            after={
              <Modal.Close>
                <IconButton
                  size="s"
                  mode="gray"
                  onClick={() => hapticFeedback.impactOccurred("light")}
                >
                  <X
                    size={20}
                    strokeWidth={3}
                    style={{
                      color: tSubtitleTextColor,
                    }}
                  />
                </IconButton>
              </Modal.Close>
            }
          />
        }
        onOpenChange={setJumpToDateModalOpen}
      >
        <div className="min-h-64 pb-10">
          <DateSelector
            monthGroupedData={monthGroupedData}
            onDateSelect={handleDateSelect}
          />
        </div>
      </Modal>
    </>
  );
};

const ExpenseCell = memo(
  ({
    expense,
    userId,
    onExpenseToggle,
    isSelected,
  }: {
    expense: RouterOutputs["expense"]["getExpenseByChat"][number];
    userId: number;
    onExpenseToggle: (updater: Updater<string[]>) => void;
    isSelected: boolean;
  }) => {
    const { selectedCurrency } = routeApi.useSearch();
    const tButtonColor = useSignal(themeParams.buttonColor);

    const { data: expenseDetails, status: expenseDetailsStatus } =
      trpc.expense.getExpenseDetails.useQuery({
        expenseId: expense.id,
      });

    // Determine the relation of the user to the expense (payer, borrower, unrelated)
    const expenseRelation = useMemo(() => {
      const payerIsYou = expense.payerId === userId;
      const isUnrelated =
        !payerIsYou &&
        !expenseDetails?.shares.some((share) => share.userId === userId);

      switch (true) {
        case payerIsYou:
          return "payer";
        case isUnrelated:
          return "unrelated";
        default:
          return "borrower";
      }
    }, [expense.payerId, expenseDetails?.shares, userId]);

    // Amount borrowed for this expense
    const borrowedAmount = useMemo(() => {
      if (expenseRelation !== "borrower") return 0;
      if (!expenseDetails?.shares) return 0;

      // Find the current user's share amount
      const userShare = expenseDetails.shares.find(
        (share) => share.userId === userId
      );
      return userShare?.amount ?? 0;
    }, [userId, expenseDetails, expenseRelation]);

    // Amount lent for this expense
    const lentAmount = useMemo(() => {
      if (expenseRelation !== "payer") return 0;
      if (!expenseDetails?.shares) return 0;

      // Sum all shares except the payer's own share
      let total = 0;
      for (const share of expenseDetails.shares) {
        if (share.userId !== userId) {
          total += share.amount;
        }
      }
      return total;
    }, [expenseRelation, expenseDetails?.shares, userId]);

    return (
      <Cell
        className={cn(isSelected && "bg-blue-50 dark:bg-blue-950")}
        Component="label"
        before={
          <Checkbox
            value={expense.id}
            checked={isSelected}
            onChange={(e) =>
              onExpenseToggle((prev) =>
                e.target.checked
                  ? [...prev, e.target.value]
                  : prev.filter((id) => id !== e.target.value)
              )
            }
          />
        }
        subhead={
          <Caption
            weight="1"
            level="1"
            style={{
              color: expenseRelation === "payer" ? tButtonColor : undefined,
            }}
          >
            {expenseRelation === "payer"
              ? "You"
              : expenseDetails?.payer?.firstName}{" "}
            spent
          </Caption>
        }
        description={expense.description}
        after={
          <Info
            avatarStack={
              <Info type="text">
                <div className="flex flex-col items-end gap-1.5">
                  <Caption className="w-max" weight="2">
                    {formatExpenseDateShort(new Date(expense.createdAt))}
                  </Caption>
                  <Skeleton visible={expenseDetailsStatus === "pending"}>
                    {(() => {
                      switch (expenseRelation) {
                        case "payer":
                          return lentAmount === 0 ? (
                            <Text weight="3">✅</Text>
                          ) : (
                            <Text weight="3" className="text-green-600">
                              {formatCurrencyWithCode(
                                lentAmount,
                                selectedCurrency
                              )}
                            </Text>
                          );
                        case "borrower":
                          return borrowedAmount === 0 ? (
                            <Text weight="3">✅</Text>
                          ) : (
                            <Text weight="3" className="text-red-600">
                              {formatCurrencyWithCode(
                                borrowedAmount,
                                selectedCurrency
                              )}
                            </Text>
                          );
                        case "unrelated":
                          return <Text weight="3">~</Text>;
                        default:
                          return null;
                      }
                    })()}
                  </Skeleton>
                  <Caption className="w-max">
                    {(() => {
                      switch (expenseRelation) {
                        case "unrelated":
                          return "Unrelated";
                        case "borrower":
                          return borrowedAmount === 0 ? "Even" : "Borrowed";
                        case "payer":
                          return lentAmount === 0 ? "Even" : "Lent";
                        default:
                          return "";
                      }
                    })()}
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

ExpenseCell.displayName = "ExpenseCell";

export default VirtualizedExpenseList;
