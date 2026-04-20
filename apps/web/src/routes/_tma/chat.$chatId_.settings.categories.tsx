import { createFileRoute } from "@tanstack/react-router";
import ManageCategoriesPage from "@/components/features/Settings/ManageCategoriesPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/settings/categories")(
  {
    component: RouteComponent,
  }
);

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <ManageCategoriesPage chatId={Number(chatId)} />;
}
