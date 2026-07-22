import { createFileRoute } from "@tanstack/react-router";
import BotSettingsSubPage from "@/components/features/Settings/BotSettingsSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/bot")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <BotSettingsSubPage chatId={Number(chatId)} />;
}
