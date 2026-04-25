import { createFileRoute } from "@tanstack/react-router";
import AccountSubPage from "@/components/features/Settings/AccountSubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/account")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <AccountSubPage chatId={Number(chatId)} />;
}
