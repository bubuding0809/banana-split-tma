import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";

export const queryClient = new QueryClient();

export const trpcReact = createTRPCReact<AppRouter>();

export const trpcClient = trpcReact.createClient({
  links: [
    httpBatchLink({
      url: "/api/admin/trpc",
      transformer: superjson,
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});
