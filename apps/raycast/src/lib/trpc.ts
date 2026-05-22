import { getPreferenceValues } from "@raycast/api";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";

interface BananaPreferences {
  apiKey: string;
  apiUrl: string;
}

export type BananaTrpcClient = TRPCClient<AppRouter>;

/** The API key + base URL from extension preferences (for non-tRPC calls). */
export function getApiPreferences(): BananaPreferences {
  return getPreferenceValues<BananaPreferences>();
}

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
