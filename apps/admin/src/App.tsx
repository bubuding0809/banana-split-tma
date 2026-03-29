import { QueryClientProvider } from "@tanstack/react-query";
import { trpcClient, trpcReact, queryClient } from "./utils/trpc";
import { BroadcastDashboard } from "./components/BroadcastDashboard";

export function App() {
  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-gray-100 p-8">
          <BroadcastDashboard />
        </div>
      </QueryClientProvider>
    </trpcReact.Provider>
  );
}
