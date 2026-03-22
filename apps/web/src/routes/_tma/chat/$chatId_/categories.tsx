import { createFileRoute } from "@tanstack/react-router";
import ManageCategoriesPage from "@/components/features/Settings/ManageCategoriesPage";

export const Route = createFileRoute("/_tma/chat/$chatId_/categories")({
  component: ManageCategoriesComponent,
});

function ManageCategoriesComponent() {
  const { chatId } = Route.useParams();
  return <ManageCategoriesPage chatId={Number(chatId)} />;
}
