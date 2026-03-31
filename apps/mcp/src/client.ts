import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { env } from "./env.js";
import type { AppRouter } from "@dko/trpc";

/** The tRPC client type for dependency injection into tools. */
export type TrpcClient = ReturnType<typeof createTrpcClient>;

/** Creates a tRPC client authenticated with the given API key. */
export function createTrpcClient(apiKey: string): any {
  return createTRPCClient({
    links: [
      httpBatchLink({
        url: env.apiUrl,
        transformer: superjson,
        headers() {
          return {
            "x-api-key": apiKey,
          };
        },
      }),
    ],
  });
}
