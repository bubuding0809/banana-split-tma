import { createFileRoute } from "@tanstack/react-router";
import ManageCategoriesPage from "@/components/features/Settings/ManageCategoriesPage";

// Index route for /chat/$chatId_/settings/categories exactly. Parent
// `.categories.tsx` is a layout rendering <Outlet />; this file hosts the
// Manage Categories screen.
export const Route = createFileRoute(
  "/_tma/chat/$chatId_/settings/categories/"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <ManageCategoriesPage chatId={Number(chatId)} />;
}
