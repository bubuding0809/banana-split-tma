import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: process.env.TRPC_URL ?? "http://localhost:3001/api/trpc",
      transformer: superjson,
      headers() {
        return {
          ...(process.env.API_KEY && {
            "x-api-key": process.env.API_KEY,
          }),
        };
      },
    }),
  ],
});
