import { createFileRoute } from "@tanstack/react-router";
import CurrencySubPage from "@/components/features/Settings/CurrencySubPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/currency")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <CurrencySubPage chatId={Number(chatId)} />;
}
