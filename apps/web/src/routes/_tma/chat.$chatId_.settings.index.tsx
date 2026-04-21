import { createFileRoute } from "@tanstack/react-router";
import ChatSettingsPage from "@/components/features/Settings/ChatSettingsPage";

// Index route for /chat/$chatId_/settings exactly. The parent settings.tsx
// is a layout-only file that renders <Outlet />; this file renders the
// actual settings screen when no child route is active.
export const Route = createFileRoute("/_tma/chat/$chatId_/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <ChatSettingsPage chatId={Number(chatId)} />;
}
