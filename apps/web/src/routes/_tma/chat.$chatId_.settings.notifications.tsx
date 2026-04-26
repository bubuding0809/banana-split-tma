import { createFileRoute } from "@tanstack/react-router";
import EventAlertsSubPage from "@/components/features/Settings/EventAlertsSubPage";

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/settings/notifications"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <EventAlertsSubPage chatId={Number(chatId)} />;
}
