import { createFileRoute } from "@tanstack/react-router";
import RecurringTemplatesList from "@/components/features/Expense/RecurringTemplatesList";

export const Route = createFileRoute("/_tma/chat/$chatId_/recurring-expenses")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <RecurringTemplatesList chatId={Number(chatId)} />;
}
