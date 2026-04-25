import { createFileRoute } from "@tanstack/react-router";
import DeveloperSubPage from "@/components/features/Settings/DeveloperSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/developer")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <DeveloperSubPage chatId={Number(chatId)} />;
}
