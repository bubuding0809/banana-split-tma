import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import EditExpensePage from "@components/features/Expense/EditExpensePage";

const searchSchema = z.object({
  prevTab: z.enum(["balance", "transaction"]).catch("balance"),
  currentFormStep: z.number().catch(0),
  membersExpanded: z.boolean().catch(false),
});

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/edit-expense/$expenseId"
)({
  component: RouteComponent,
  validateSearch: zodValidator(searchSchema),
});

function RouteComponent() {
  const { chatId, expenseId } = Route.useParams();
  return <EditExpensePage chatId={Number(chatId)} expenseId={expenseId} />;
}
