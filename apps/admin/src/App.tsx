import { QueryClientProvider } from "@tanstack/react-query";
import { trpcClient, trpcReact, queryClient } from "./utils/trpc";

export function App() {
  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-gray-100 p-8">
          <div className="mx-auto max-w-4xl rounded-xl bg-white p-6 shadow-md">
            <h1 className="mb-4 text-2xl font-bold text-gray-800">
              Admin Dashboard
            </h1>
            <p className="text-gray-600">
              tRPC and React Query initialized successfully.
            </p>
          </div>
        </div>
      </QueryClientProvider>
    </trpcReact.Provider>
  );
}
