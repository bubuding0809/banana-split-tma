import { Outlet, createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

const searchSchema = z.object({
  prevTab: z.enum(["balance", "transaction"]).catch("balance"),
});

// Layout-only route. The actual settings screen lives in
// `chat.$chatId_.settings.index.tsx`; child routes like
// `settings/categories` render here via <Outlet />. Previously this file
// rendered `<ChatSettingsPage>` directly, which left no Outlet for the
// child routes — navigating to /settings/categories updated the URL but
// the page content never changed.
export const Route = createFileRoute("/_tma/chat/$chatId_/settings")({
  component: RouteComponent,
  validateSearch: zodValidator(searchSchema),
});

function RouteComponent() {
  return <Outlet />;
}
