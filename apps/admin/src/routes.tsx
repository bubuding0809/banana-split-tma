import { Navigate, createBrowserRouter, Outlet } from "react-router-dom";
import { AdminShell } from "./components/shell/AdminShell";
import { BroadcastPage } from "./components/broadcast/BroadcastPage";
import { BroadcastHistoryPage } from "./components/broadcast/BroadcastHistoryPage";
import type { Session } from "./hooks/useSession";

export function buildRouter(session: Session, onLogout: () => void) {
  return createBrowserRouter([
    {
      element: <AdminShell session={session} onLogout={onLogout} />,
      children: [
        { path: "/", element: <Navigate to="/broadcast/compose" replace /> },
        {
          path: "/broadcast",
          element: <Navigate to="/broadcast/compose" replace />,
        },
        { path: "/broadcast/compose", element: <BroadcastPage /> },
        {
          path: "/broadcast/history",
          element: <Outlet />,
          children: [
            { index: true, element: <BroadcastHistoryPage /> },
            { path: ":broadcastId", element: <BroadcastHistoryPage /> },
          ],
        },
      ],
    },
  ]);
}
