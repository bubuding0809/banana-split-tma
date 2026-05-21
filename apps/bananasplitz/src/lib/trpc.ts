import { getPreferenceValues } from "@raycast/api";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";

interface BananaPreferences {
  apiKey: string;
  apiUrl: string;
}

export type BananaTrpcClient = TRPCClient<AppRouter>;

/**
 * Build a tRPC client authenticated with the user-level API key stored in the
 * extension preferences. Mirrors apps/cli/src/client.ts.
 */
export function getTrpcClient(): BananaTrpcClient {
  const { apiKey, apiUrl } = getPreferenceValues<BananaPreferences>();
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: apiUrl,
        transformer: superjson,
        headers: () => ({ "x-api-key": apiKey }),
      }),
    ],
  });
}
