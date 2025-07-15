import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCQueryUtils, createTRPCReact } from "@trpc/react-query";
import { TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";
import { initDataRaw } from "@telegram-apps/sdk-react";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on NOT_FOUND errors (404)
        if (
          error instanceof TRPCClientError &&
          error.data?.code === "NOT_FOUND"
        ) {
          return false;
        }
        // Default retry logic: retry up to 3 times for other errors
        return failureCount < 3;
      },
    },
  },
});

export const trpc = createTRPCReact<AppRouter>({});
export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_TRPC_URL ?? "/trpc",
      transformer: superjson,
      async headers() {
        return {
          Authorization: `tma ${initDataRaw()}`,
        };
      },
    }),
  ],
});

export const trpcUtils = createTRPCQueryUtils({
  client: trpcClient,
  queryClient,
});
