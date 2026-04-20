import { createFileRoute } from "@tanstack/react-router";
import EditChatCategoryPage from "@/components/features/Settings/EditChatCategoryPage";

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/settings/categories/new"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <EditChatCategoryPage chatId={Number(chatId)} />;
}
