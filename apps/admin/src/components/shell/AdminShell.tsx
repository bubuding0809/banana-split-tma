import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import type { Session } from "@/hooks/useSession";

type Props = {
  session: Session;
  onLogout: () => void;
};

export function AdminShell({ session, onLogout }: Props) {
  return (
    <div className="flex h-screen">
      <Sidebar session={session} onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
