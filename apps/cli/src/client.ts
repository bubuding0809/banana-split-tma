import { createTRPCClient, type TRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";

export type TrpcClient = TRPCClient<AppRouter>;

export function createTrpcClient(
  apiKey: string,
  apiUrl: string
): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
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
