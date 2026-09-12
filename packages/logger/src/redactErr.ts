import { stdSerializers } from "pino";

// Telegram bot tokens appear in request URLs as `bot<id>:<secret>`. Network
// errors from HTTP clients (node-fetch's FetchError, undici) embed that URL in
// their message and stack, and pino's err serializer recurses into nested
// errors, so a single `log.error({ err })` can ship the token to Axiom.
const TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/g;

export function redactBotTokens(s: string): string {
  return s.replace(TOKEN_RE, "bot[REDACTED]");
}

type SerializedError = ReturnType<typeof stdSerializers.err>;

// The prototype pino gives every serialized error. Objects with it (the top
// level and any nested `error` it serialized) are fresh copies we may rebuild.
const pinoErrProto: object | null = Object.getPrototypeOf(
  stdSerializers.err(new Error("probe"))
);

function isRebuildable(value: object): boolean {
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null || proto === pinoErrProto;
}

function scrub(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === "string") return redactBotTokens(value);
  if (value === null || typeof value !== "object") return value;
  // Class instances (Buffers, Dates, InputFiles...) pass through untouched so
  // their own JSON behaviour is preserved.
  if (!isRebuildable(value)) return value;
  const cached = seen.get(value);
  if (cached !== undefined) return cached;

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const item of value) out.push(scrub(item, seen));
    return out;
  }

  // Copy rather than mutate: non-error fields in pino's output are references
  // to the caller's own objects (e.g. a GrammyError's request payload).
  const proto = Object.getPrototypeOf(value) as object | null;
  const out = Object.create(proto) as Record<string, unknown>;
  seen.set(value, out);
  const src = value as Record<string, unknown>;
  for (const key of Object.keys(src)) out[key] = scrub(src[key], seen);
  if (proto === pinoErrProto) {
    // `raw` is a non-enumerable accessor pino uses to hand hooks the original
    // error; keep the reference so the shape matches stdSerializers.err.
    out.raw = src.raw;
  }
  return out;
}

/**
 * Drop-in replacement for pino's `stdSerializers.err` that scrubs Telegram
 * bot tokens from every string in the serialized error, recursively
 * (message, stack, nested `error`, causes folded into message/stack, extra
 * fields). Output shape is otherwise identical.
 */
export function redactingErrSerializer(err: Error): SerializedError {
  return scrub(stdSerializers.err(err), new WeakMap()) as SerializedError;
}
