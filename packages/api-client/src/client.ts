import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";

export type TrpcClient = TRPCClient<AppRouter>;

export interface ApiKeyClientOptions {
  apiKey: string;
  apiUrl: string;
}

/** tRPC HTTP client authenticated with an x-api-key header. */
export function createApiKeyClient({
  apiKey,
  apiUrl,
}: ApiKeyClientOptions): TrpcClient {
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

/** @deprecated Use createApiKeyClient */
export const createTrpcClient = createApiKeyClient;
