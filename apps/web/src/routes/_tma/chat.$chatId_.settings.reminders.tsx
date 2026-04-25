import { createFileRoute } from "@tanstack/react-router";
import RecurringReminderSubPage from "@/components/features/Settings/RecurringReminderSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/reminders")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <RecurringReminderSubPage chatId={Number(chatId)} />;
}
