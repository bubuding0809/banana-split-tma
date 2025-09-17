import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import AddExpensePage from "@components/features/Expense/AddExpensePage";

const searchSchema = z.object({
  prevTab: z.enum(["balance", "transaction"]).catch("balance"),
  currentFormStep: z.number().catch(0),
  membersExpanded: z.boolean().catch(false),
});

export const Route = createFileRoute("/_tma/chat/$chatId_/add-expense")({
  component: RouteComponent,
  validateSearch: zodValidator(searchSchema),
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <AddExpensePage chatId={Number(chatId)} />;
}
