import { createFileRoute } from "@tanstack/react-router";
import OrganizeCategoriesPage from "@/components/features/Settings/OrganizeCategoriesPage";

export const Route = createFileRoute(
  "/_tma/chat/$chatId_/settings/categories/organize"
)({
  component: function RouteComponent() {
    const { chatId } = Route.useParams();
    return <OrganizeCategoriesPage chatId={Number(chatId)} />;
  },
});
