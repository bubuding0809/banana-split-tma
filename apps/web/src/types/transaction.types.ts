import { type inferRouterOutputs } from "@trpc/server";
import { AppRouter } from "@dko/trpc";

export type ExpenseTransaction =
  inferRouterOutputs<AppRouter>["expense"]["getExpenseByChat"][number] & {
    type: "expense";
  };

export type SettlementTransaction =
  inferRouterOutputs<AppRouter>["settlement"]["getSettlementByChat"][number] & {
    type: "settlement";
  };

export type CombinedTransaction = ExpenseTransaction | SettlementTransaction;

export type GroupedTransactions = Record<string, CombinedTransaction[]>;
