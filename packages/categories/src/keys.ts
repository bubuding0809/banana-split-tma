import { BASE_CATEGORIES } from "./base.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BASE_KEY_SET: ReadonlySet<string> = new Set(
  BASE_CATEGORIES.map((c) => c.id)
);

export function isBaseKey(key: string): boolean {
  return BASE_KEY_SET.has(key);
}

export function isCustomKey(key: string): boolean {
  if (!key.startsWith("chat:")) return false;
  return UUID_RE.test(key.slice("chat:".length));
}

export function parseCustomKey(key: string): string | null {
  if (!isCustomKey(key)) return null;
  return key.slice("chat:".length);
}

export function assertKnownKey(
  key: string,
  knownCustomIds: ReadonlySet<string>
): void {
  if (isBaseKey(key)) return;
  const custom = parseCustomKey(key);
  if (custom !== null && knownCustomIds.has(custom)) return;
  throw new Error(`Unknown category key: ${key}`);
}
