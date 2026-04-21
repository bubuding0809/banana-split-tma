import { Outlet, createFileRoute } from "@tanstack/react-router";

// Layout-only route for /chat/$chatId_/settings/categories — child routes
// (new, $categoryId) render via <Outlet />. The manage screen itself lives
// in `chat.$chatId_.settings.categories.index.tsx`.
export const Route = createFileRoute("/_tma/chat/$chatId_/settings/categories")(
  {
    component: RouteComponent,
  }
);

function RouteComponent() {
  return <Outlet />;
}
