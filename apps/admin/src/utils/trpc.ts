import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";

export const queryClient = new QueryClient();

export const trpcReact = createTRPCReact() as any;

export const trpcClient = trpcReact.createClient({
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_TRPC_URL || "http://localhost:3000/api/trpc",
      transformer: superjson,
      headers() {
        return {
          "x-api-key": import.meta.env.VITE_API_KEY || "",
        };
      },
    }),
  ],
});
