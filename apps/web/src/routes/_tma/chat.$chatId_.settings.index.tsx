import { createFileRoute } from "@tanstack/react-router";
import SettingsHubPage from "@/components/features/Settings/SettingsHubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <SettingsHubPage chatId={Number(chatId)} />;
}
