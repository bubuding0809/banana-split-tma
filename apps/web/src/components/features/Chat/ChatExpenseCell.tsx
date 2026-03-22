import {
  initData,
  secondaryButton,
  themeParams,
  useSignal,
  popup,
  hapticFeedback,
} from "@telegram-apps/sdk-react";
import {
  Badge,
  Caption,
  Cell,
  Info,
  Skeleton,
  Text,
} from "@telegram-apps/telegram-ui";
import { type inferRouterOutputs } from "@trpc/server";
import { useEffect, useMemo, useRef, useState } from "react";

import { trpc } from "@utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import ExpenseDetailsModal from "./ExpenseDetailsModal";
import {
  formatExpenseDateShort,
  formatExpenseDateShortCreatedAt,
} from "@utils/date";
import { formatCurrencyWithCode } from "@/utils/financial";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { cn } from "@/utils/cn";
import { CSS_CLASSES } from "@/constants/ui";
import { Link, Link2Off } from "lucide-react";

interface ChatExpenseCellProps {
  expense: inferRouterOutputs<AppRouter>["expense"]["getExpenseByChat"][number];
  sortBy?: "date" | "createdAt";
}

const ChatExpenseCell = ({
  expense,
  sortBy = "date",
}: ChatExpenseCellProps) => {
  const { payerId, chatId } = expense;

  const router = useRouter();
  const { selectedTab, selectedExpense } = useSearch({ strict: false }) as {
    selectedTab?: string;
    selectedExpense?: string;
  };
  const navigate = useNavigate();

  // Route-agnostic search param updater (works on both /_tma/chat/ and /_tma/chat/$chatId)

  const updateSearchParams = (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>
  ) => {
    navigate({ search: updater as any });
  };
  const trpcUtils = trpc.useUtils();
  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tDesctructiveTextColor = useSignal(themeParams.destructiveTextColor);

  const [modalOpen, setModalOpen] = useState(
    () => expense?.id === selectedExpense
  );
  const [highlighted, setHighlighted] = useState(false);
  const offSecondaryButtonClickRef = useRef<VoidFunction | undefined>(
    undefined
  );
  const cellRef = useRef<HTMLDivElement>(null);

  const userId = tUserData?.id ?? 0;

  // * Effects =====================================================================================
  useEffect(() => {
    return () => {
      offSecondaryButtonClickRef.current?.();
    };
  }, []);

  // * Queries =====================================================================================
  const { data: expenseDetails, isLoading: isExpenseDetailsLoading } =
    trpc.expense.getExpenseDetails.useQuery({
      expenseId: expense.id,
    });
  const { data: member, isLoading: isMemberLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId,
      userId: payerId,
    });
  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  //* Mutations ====================================================================================
  const deleteExpenseMutation = trpc.expense.deleteExpense.useMutation({
    onSuccess: () => {
      trpcUtils.expense.getAllExpensesByChat.invalidate({
        chatId,
      });
      trpcUtils.currency.getCurrenciesWithBalance.invalidate({
        userId,
        chatId,
      });
    },
  });

  // * State =======================================================================================
  const memberFullName = `${member?.user.first_name}${
    member?.user.last_name ? ` ${member.user.last_name}` : ""
  }`;

  // Determine the relation of the user to the expense (payer, borrower, unrelated)
  const expenseRelation = useMemo(() => {
    const payerIsYou = member?.user.id === userId;
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
  }, [expenseDetails?.shares, member?.user.id, userId]);

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

  const onDeleteExpense = async () => {
    const action = await popup.open.ifAvailable({
      title: "Delete Expense?",
      message: `You can't undo this action.`,
      buttons: [
        {
          type: "destructive",
          text: "Delete",
          id: "delete-expense",
        },
        {
          type: "cancel",
        },
      ],
    });

    if (action === "delete-expense") {
      secondaryButton.setParams({
        isLoaderVisible: true,
        isEnabled: false,
      });
      try {
        await deleteExpenseMutation.mutateAsync({
          expenseId: expense.id,
        });
        handleModalOpenChange(false);
      } catch (error) {
        console.error("Failed to delete expense:", error);
        alert("Failed to delete expense. Please try again later.");
      } finally {
        secondaryButton.setParams({
          isLoaderVisible: false,
          isEnabled: true,
        });
      }
    }
  };

  const onEditExpense = async () => {
    hapticFeedback.notificationOccurred("success");
    navigate({
      to: "/chat/$chatId/edit-expense/$expenseId",
      params: { chatId: chatId.toString(), expenseId: expense.id },
      search: {
        title: "✍️ Edit Expense",
        prevTab: selectedTab,
        membersExpanded: Number(expenseDetails?.payer?.id) !== userId,
      },
    });
  };

  // * Handlers ====================================================================================
  const handleModalOpenChange = (open: boolean) => {
    if (open) {
      setHighlighted(true);
      updateSearchParams((prev) => ({
        ...prev,
        selectedExpense: expense.id,
      }));

      secondaryButton.setParams({
        text: "Delete",
        isVisible: true,
        isEnabled: true,
        textColor: tDesctructiveTextColor,
      });

      router.preloadRoute({
        to: "/chat/$chatId/edit-expense/$expenseId",
        params: { expenseId: expense.id, chatId: chatId.toString() },
        search: {
          title: "✍️ Edit Expense",
          prevTab: selectedTab,
          membersExpanded: Number(expenseDetails?.payer?.id) !== userId,
        },
      });

      offSecondaryButtonClickRef.current =
        secondaryButton.onClick(onDeleteExpense);
    } else {
      setTimeout(() => {
        setHighlighted(false);
      }, 150);

      updateSearchParams((prev) => ({
        ...prev,
        selectedExpense: undefined,
      }));

      secondaryButton.setParams({
        isVisible: false,
        isEnabled: false,
        textColor: tButtonColor,
      });

      offSecondaryButtonClickRef.current?.();
    }

    setModalOpen(open);
  };

  const handleCellClick = () => {
    setModalOpen(true);
    hapticFeedback.selectionChanged();
  };

  return (
    <>
      <Cell
        className={cn("transition", {
          [CSS_CLASSES.SELECT_HIGHLIGHT]: highlighted,
        })}
        ref={cellRef}
        onClick={handleCellClick}
        before={<ChatMemberAvatar userId={payerId} size={28} />}
        subhead={
          <Skeleton visible={isMemberLoading}>
            <Caption
              weight="1"
              level="1"
              style={{
                color: expenseRelation === "payer" ? tButtonColor : undefined,
              }}
            >
              {expenseRelation === "payer" ? "You" : memberFullName} spent
            </Caption>
            {expenseRelation !== "unrelated" && (
              <Badge type="number">
                <Link size={10} />
              </Badge>
            )}
          </Skeleton>
        }
        description={
          <>
            on{" "}
            <Caption weight="2" level="1" className="max-w-[120px] truncate">
              {expense.description}
            </Caption>
            {expense.categoryIcon && expense.categoryName && (
              <>
                <span className="mx-0.5 opacity-50">•</span>
                <span className="flex items-center gap-0.5 text-xs opacity-70">
                  <span>{expense.categoryIcon}</span>
                  <span>{expense.categoryName}</span>
                </span>
              </>
            )}
          </>
        }
        after={
          <Info
            avatarStack={
              <Info type="text">
                <div className="flex flex-col items-end gap-1.5">
                  <Caption className="w-max" weight="2">
                    {sortBy === "createdAt"
                      ? formatExpenseDateShortCreatedAt(expense.createdAt)
                      : formatExpenseDateShort(expense.date)}
                  </Caption>
                  <Skeleton visible={isExpenseDetailsLoading}>
                    {(() => {
                      switch (expenseRelation) {
                        case "payer":
                          return lentAmount === 0 ? (
                            <Text weight="3">✅</Text>
                          ) : (
                            <Text weight="3" className="text-green-600">
                              {formatCurrencyWithCode(
                                lentAmount,
                                expense.currency
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
                                expense.currency
                              )}
                            </Text>
                          );
                        case "unrelated":
                          return <Link2Off size={16} className="my-0.5" />;
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
        {
          supportedCurrencies?.find((c) => c.code === expense.currency)
            ?.flagEmoji
        }{" "}
        {formatCurrencyWithCode(expense.amount, expense.currency)}
      </Cell>
      <ExpenseDetailsModal
        open={modalOpen}
        onOpenChange={handleModalOpenChange}
        expense={expense}
        member={member}
        isMemberLoading={isMemberLoading}
        expenseDetails={expenseDetails}
        userId={userId}
        onEdit={onEditExpense}
      />
    </>
  );
};

export default ChatExpenseCell;
