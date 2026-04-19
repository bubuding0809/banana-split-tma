import { QueryClientProvider } from "@tanstack/react-query";
import { trpcClient, trpcReact, queryClient } from "./utils/trpc";
import { BroadcastPage } from "./components/broadcast/BroadcastPage";
import { LoginPage } from "./components/auth/LoginPage";
import { Toaster } from "@/components/ui/sonner";
import { useSession } from "./hooks/useSession";

export function App() {
  const { state, refresh, logout } = useSession();

  if (state.status === "loading") {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <>
        <LoginPage onAuthenticated={refresh} />
        <Toaster richColors closeButton position="bottom-right" />
      </>
    );
  }

  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <BroadcastPage session={state.session} onLogout={logout} />
        <Toaster richColors closeButton position="bottom-right" />
      </QueryClientProvider>
    </trpcReact.Provider>
  );
}
