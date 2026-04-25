import { createFileRoute } from "@tanstack/react-router";
import EditRecurringSchedulePage from "@/components/features/Expense/EditRecurringSchedulePage";

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/edit-recurring/$templateId"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId, templateId } = Route.useParams();
  return (
    <EditRecurringSchedulePage
      chatId={Number(chatId)}
      templateId={templateId}
    />
  );
}
