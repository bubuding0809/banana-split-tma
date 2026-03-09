import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { env } from "./env.js";

// Import the AppRouter type from the trpc package for type safety.
import type { AppRouter } from "@dko/trpc";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: env.apiUrl,
      transformer: superjson,
      headers() {
        return {
          "x-api-key": env.apiKey,
        };
      },
    }),
  ],
});
