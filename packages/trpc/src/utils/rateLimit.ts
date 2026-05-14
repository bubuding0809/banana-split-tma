interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export function takeToken(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/**
 * Returns the resetAt epoch (ms) if the bucket is currently spent
 * (no tokens remaining within the window) and not yet expired,
 * or null if the next call to `takeToken` would succeed.
 *
 * Pure read — does not consume a token.
 */
export function peekTokenResetAt(key: string, limit: number): number | null {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) return null;
  if (bucket.count < limit) return null;
  return bucket.resetAt;
}
