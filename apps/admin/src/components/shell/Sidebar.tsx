import { NavLink } from "react-router-dom";
import { LogOut, MessageSquare, Send, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Session } from "@/hooks/useSession";

type Props = {
  session: Session;
  onLogout: () => void;
};

export function Sidebar({ session, onLogout }: Props) {
  return (
    <aside className="bg-background flex w-60 shrink-0 flex-col border-r">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="text-xl">🍌</span>
        <span className="text-sm font-semibold tracking-tight">Admin</span>
      </div>

      <nav className="flex-1 px-2">
        <div className="text-muted-foreground px-2 py-1 text-xs font-medium uppercase">
          <span className="inline-flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" /> Broadcast
          </span>
        </div>
        <ul className="flex flex-col gap-0.5">
          <li>
            <NavLink
              to="/broadcast/compose"
              className={({ isActive }) =>
                `hover:bg-muted flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-muted font-medium" : ""}`
              }
            >
              <Send className="h-3.5 w-3.5" /> Compose
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/broadcast/history"
              className={({ isActive }) =>
                `hover:bg-muted flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-muted font-medium" : ""}`
              }
            >
              <History className="h-3.5 w-3.5" /> History
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="flex flex-col gap-1 border-t px-3 py-3">
        <span className="text-muted-foreground text-xs">
          {session.username ? `@${session.username}` : session.firstName}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="h-7 justify-start gap-1.5 px-2 text-xs"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
