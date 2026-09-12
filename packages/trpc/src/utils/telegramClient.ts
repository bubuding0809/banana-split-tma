import { Api } from "grammy";

// Bot tokens sit in the request URL as `bot<id>:<secret>`.
const TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/g;

function redact(s: string): string {
  return s.replace(TOKEN_RE, "bot[REDACTED]");
}

function scrubStringProp(target: object, key: "message" | "stack"): void {
  const current = (target as Record<string, unknown>)[key];
  if (typeof current !== "string") return;
  const next = redact(current);
  if (next === current) return;
  const desc = Object.getOwnPropertyDescriptor(target, key);
  try {
    if (!desc || desc.writable || desc.set) {
      (target as Record<string, unknown>)[key] = next;
      if ((target as Record<string, unknown>)[key] === next) return;
    }
    Object.defineProperty(target, key, {
      value: next,
      writable: true,
      configurable: true,
      enumerable: desc?.enumerable ?? false,
    });
  } catch {
    // Non-configurable and non-writable: nothing more we can do here. The
    // logger's err serializer scrubs the serialized copy as a second layer.
  }
}

/**
 * Scrub the token pattern from an error, its wrapped `.error` (grammy's
 * HttpError keeps the underlying fetch error there) and its `.cause` chain.
 * Mutates in place so the caller rethrows the same object and
 * `instanceof HttpError` / `GrammyError` checks keep working.
 */
function scrubError(err: unknown, seen: Set<object>): void {
  if (err === null || typeof err !== "object" || seen.has(err)) return;
  seen.add(err);
  scrubStringProp(err, "message");
  scrubStringProp(err, "stack");
  const e = err as { error?: unknown; cause?: unknown };
  scrubError(e.error, seen);
  scrubError(e.cause, seen);
}

/**
 * The one place server code builds a grammy Bot API client.
 *
 * grammy wraps network failures in an HttpError whose `.error` is the raw
 * fetch error, and that error's message and stack contain the request URL,
 * token included. telegraf redacted before throwing; grammy does not. The
 * installed transformer restores that guarantee: every error leaving this
 * client has the token pattern scrubbed. Successful calls and request bodies
 * pass through untouched.
 *
 * `apiRoot` is only ever set by the local UAT recording proxy.
 */
export function createTelegramApi(token: string, apiRoot?: string): Api {
  const api = new Api(token, apiRoot ? { apiRoot } : undefined);
  api.config.use(async (prev, method, payload, signal) => {
    try {
      return await prev(method, payload, signal);
    } catch (err) {
      scrubError(err, new Set());
      throw err;
    }
  });
  return api;
}
