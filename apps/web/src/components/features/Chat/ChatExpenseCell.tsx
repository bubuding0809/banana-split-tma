import { initData, themeParams, useSignal } from "@telegram-apps/sdk-react";
import {
  Caption,
  Cell,
  Info,
  Skeleton,
  Text,
} from "@telegram-apps/telegram-ui";
import { type inferRouterOutputs } from "@trpc/server";
import { useMemo, useState } from "react";

import { trpc } from "@utils/trpc";
import { AppRouter } from "@dko/trpc";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import ExpenseDetailsModal from "./ExpenseDetailsModal";
import { formatExpenseDateShort } from "@utils/date";

interface ChatExpenseCellProps {
  expense: inferRouterOutputs<AppRouter>["expense"]["getExpenseByChat"][number];
}

const ChatExpenseCell = ({ expense }: ChatExpenseCellProps) => {
  const { payerId, chatId } = expense;
  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const [modalOpen, setModalOpen] = useState(false);

  // * Queries ====================================================================================
  const { data: expenseDetails, isLoading: isExpenseDetailsLoading } =
    trpc.expense.getExpenseDetails.useQuery({
      expenseId: expense.id,
    });

  const { data: member, isLoading: isMemberLoading } =
    trpc.telegram.getChatMember.useQuery({
      chatId,
      userId: payerId,
    });

  // * State ======================================================================================
  const userId = tUserData?.id ?? 0;

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
    return (
      expenseDetails?.shares.reduce((acc, share) => {
        const isCreditor = share.userId === userId;
        if (isCreditor) return acc + share.amount;
        return acc;
      }, 0) ?? 0
    );
  }, [userId, expenseDetails, expenseRelation]);

  // Amount lent for this expense
  const lentAmount = useMemo(() => {
    if (expenseRelation !== "payer") return 0;
    return (
      expenseDetails?.shares.reduce((acc, share) => {
        const isDebtor = share.userId !== userId;
        if (isDebtor) return acc + share.amount;
        return acc;
      }, 0) ?? 0
    );
  }, [expenseRelation, expenseDetails?.shares, userId]);

  return (
    <>
      <Cell
        onClick={() => setModalOpen(true)}
        before={<ChatMemberAvatar userId={payerId} size={48} />}
        subhead={
          <Skeleton visible={isMemberLoading}>
            <Caption
              weight="1"
              level="1"
              style={{
                color: expenseRelation === "payer" ? tButtonColor : undefined,
              }}
            >
              {expenseRelation === "payer" ? "You" : memberFullName} paid
            </Caption>
          </Skeleton>
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
                  <Skeleton visible={isExpenseDetailsLoading}>
                    {(() => {
                      switch (expenseRelation) {
                        case "payer":
                          return lentAmount === 0 ? (
                            <Text weight="2">✅</Text>
                          ) : (
                            <Text weight="2" className="text-green-600">
                              ${lentAmount.toFixed(2)}
                            </Text>
                          );
                        case "borrower":
                          return borrowedAmount === 0 ? (
                            <Text weight="2">✅</Text>
                          ) : (
                            <Text weight="2" className="text-red-600">
                              ${borrowedAmount.toFixed(2)}
                            </Text>
                          );
                        case "unrelated":
                          return <Text weight="2">~</Text>;
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
                          return borrowedAmount === 0 ? "Settled" : "Borrowed";
                        case "payer":
                          return lentAmount === 0 ? "Settled" : "Lent";
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
        <span className="mr-0.5 font-medium">$</span>
        {expense.amount.toFixed(2)}
      </Cell>
      <ExpenseDetailsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        expense={expense}
        member={member}
        isMemberLoading={isMemberLoading}
        expenseDetails={expenseDetails}
        isExpenseDetailsLoading={isExpenseDetailsLoading}
        userId={userId}
      />
    </>
  );
};

export default ChatExpenseCell;
