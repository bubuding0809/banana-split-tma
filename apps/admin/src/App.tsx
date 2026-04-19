import { QueryClientProvider } from "@tanstack/react-query";
import { trpcClient, trpcReact, queryClient } from "./utils/trpc";
import { BroadcastPage } from "./components/broadcast/BroadcastPage";
import { Toaster } from "@/components/ui/sonner";

export function App() {
  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <BroadcastPage />
        <Toaster richColors closeButton position="bottom-right" />
      </QueryClientProvider>
    </trpcReact.Provider>
  );
}
