import { environment } from "@raycast/api";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getApiPreferences } from "./trpc";

const AVATAR_DIR = join(environment.supportPath, "avatars");
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

/** Derive the /api/avatar base from the tRPC URL (…/api/trpc → …/api/avatar). */
function avatarBaseUrl(apiUrl: string): string | null {
  if (!/\/trpc\/?$/.test(apiUrl)) return null;
  return apiUrl.replace(/\/trpc\/?$/, "/avatar");
}

/**
 * Resolve a local file path for a user's Telegram profile photo, fetching and
 * caching it on first use. Returns null when the user has no photo, the
 * endpoint isn't reachable, or auth fails — callers fall back to a generic
 * icon. Never throws.
 */
export async function getAvatarPath(userId: number): Promise<string | null> {
  const file = join(AVATAR_DIR, `${userId}.jpg`);

  // Serve a fresh cached copy without touching the network.
  try {
    const cached = await stat(file);
    if (Date.now() - cached.mtimeMs < MAX_AGE_MS) return file;
  } catch {
    // not cached yet — fall through to fetch
  }

  const { apiKey, apiUrl } = getApiPreferences();
  const avatarUrl = avatarBaseUrl(apiUrl);
  if (!avatarUrl) return null;

  let response: Response;
  try {
    response = await fetch(`${avatarUrl}/${userId}`, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  // 404 = no Telegram photo; 401/403 = endpoint not yet deployed with
  // API-key auth, or no shared chat. Either way, use the fallback icon.
  if (!response.ok) return null;

  try {
    const bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(AVATAR_DIR, { recursive: true });
    await writeFile(file, bytes);
    return file;
  } catch {
    return null;
  }
}
