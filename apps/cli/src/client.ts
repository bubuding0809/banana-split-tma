import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";

export type TrpcClient = ReturnType<typeof createTrpcClient>;

export function createTrpcClient(apiKey: string, apiUrl: string): any {
  return createTRPCClient({
    links: [
      httpBatchLink({
        url: apiUrl,
        transformer: superjson,
        headers() {
          return { "x-api-key": apiKey };
        },
      }),
    ],
  });
}
