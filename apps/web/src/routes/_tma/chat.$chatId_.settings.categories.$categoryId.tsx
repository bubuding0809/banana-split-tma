import { createFileRoute } from "@tanstack/react-router";
import EditChatCategoryPage from "@/components/features/Settings/EditChatCategoryPage";

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/settings/categories/$categoryId"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId, categoryId } = Route.useParams();
  return (
    <EditChatCategoryPage chatId={Number(chatId)} categoryId={categoryId} />
  );
}
