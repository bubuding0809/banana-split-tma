import {
  initData,
  secondaryButton,
  themeParams,
  useSignal,
  popup,
  hapticFeedback,
} from "@telegram-apps/sdk-react";
import {
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
import ExpenseDetailsModal from "./ExpenseDetailsModal";
import RecurringExpenseBadge from "@/components/features/Expense/RecurringExpenseBadge";
import {
  formatExpenseDateShort,
  formatExpenseDateShortCreatedAt,
} from "@utils/date";
import { formatCurrencyWithCode } from "@/utils/financial";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { cn } from "@/utils/cn";
import { CSS_CLASSES } from "@/constants/ui";
import { Link2Off } from "lucide-react";

interface ChatExpenseCellProps {
  expense: inferRouterOutputs<AppRouter>["expense"]["getExpenseByChat"][number];
  sortBy?: "date" | "createdAt";
  categoryEmoji?: string;
  categoryTitle?: string;
}

const ChatExpenseCell = ({
  expense,
  sortBy = "date",
  categoryEmoji,
  categoryTitle,
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

  // Whether the user has a share in this expense (either as payer or borrower)
  const hasShare = useMemo(() => {
    if (!expenseDetails?.shares) return false;
    return expenseDetails.shares.some((share) => share.userId === userId);
  }, [expenseDetails?.shares, userId]);

  // User's share of the expense
  const shareAmount = useMemo(() => {
    if (!hasShare || !expenseDetails?.shares) return 0;
    const userShare = expenseDetails.shares.find(
      (share) => share.userId === userId
    );
    return userShare?.amount ?? 0;
  }, [hasShare, expenseDetails?.shares, userId]);

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
        before={
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-xl leading-none">
            {categoryEmoji ?? "❓"}
          </div>
        }
        subhead={
          <Skeleton visible={isMemberLoading}>
            <div className="flex items-center gap-1.5">
              <Caption
                weight="1"
                level="1"
                style={{
                  color: expenseRelation === "payer" ? tButtonColor : undefined,
                }}
              >
                {expenseRelation === "payer" ? "You" : memberFullName} spent
              </Caption>
            </div>
          </Skeleton>
        }
        description={
          <>
            on{" "}
            <Caption weight="2" level="1">
              {expenseDetails?.description}
            </Caption>
          </>
        }
        after={
          <Info
            avatarStack={
              <Info type="text">
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {expense.recurringTemplate?.status === "ACTIVE" && (
                      <RecurringExpenseBadge />
                    )}
                    <Caption className="w-max" weight="2">
                      {sortBy === "createdAt"
                        ? formatExpenseDateShortCreatedAt(expense.createdAt)
                        : formatExpenseDateShort(expense.date)}
                    </Caption>
                  </div>
                  <Skeleton visible={isExpenseDetailsLoading}>
                    {(() => {
                      switch (expenseRelation) {
                        case "payer":
                        case "borrower":
                          return (
                            <Text
                              weight="3"
                              className={cn(
                                shareAmount !== 0 && "text-red-600"
                              )}
                            >
                              {formatCurrencyWithCode(
                                shareAmount,
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
                      if (expenseRelation === "unrelated") return "unrelated";
                      if (!hasShare) return "No share";
                      return "share";
                    })()}
                  </Caption>
                </div>
              </Info>
            }
            type="avatarStack"
          />
        }
      >
        <span className="flex items-center gap-1">
          {
            supportedCurrencies?.find((c) => c.code === expense.currency)
              ?.flagEmoji
          }{" "}
          {formatCurrencyWithCode(expense.amount, expense.currency)}
        </span>
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
        categoryEmoji={categoryEmoji}
        categoryTitle={categoryTitle}
      />
    </>
  );
};

export default ChatExpenseCell;
