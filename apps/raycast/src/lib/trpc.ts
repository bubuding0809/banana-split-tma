import { getPreferenceValues } from "@raycast/api";
import { createApiKeyClient, type TrpcClient } from "@bananasplitz/api-client";

interface BananaPreferences {
  apiKey: string;
  apiUrl: string;
}

export type BananaTrpcClient = TrpcClient;

/** The API key + base URL from extension preferences (for non-tRPC calls). */
export function getApiPreferences(): BananaPreferences {
  return getPreferenceValues<BananaPreferences>();
}

/** Build a tRPC client authenticated with the user-level API key stored in preferences. */
export function getTrpcClient(): BananaTrpcClient {
  const { apiKey, apiUrl } = getPreferenceValues<BananaPreferences>();
  return createApiKeyClient({ apiKey, apiUrl });
}
