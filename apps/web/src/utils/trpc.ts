import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";
export const queryClient = new QueryClient();

export const trpc = createTRPCReact<AppRouter>({});
export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_TRPC_URL ?? "/trpc",
      transformer: superjson,
    }),
  ],
});
