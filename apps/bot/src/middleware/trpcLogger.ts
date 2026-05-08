import type { Logger } from "@repo/logger";

// Wrap a tRPC caller so every leaf procedure call emits trpc.call.start /
// trpc.call.end with the dotted procedure path and duration. Nested
// namespaces (e.g. expense.recurring.list) are handled by recursing on
// non-function objects. Symbol props pass through untouched so Proxy
// internals (Symbol.toPrimitive, etc.) keep working.
export function wrapCallerWithLogging<T extends object>(
  target: T,
  log: Logger,
  path: readonly string[] = []
): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver);
      if (typeof prop === "symbol") return value;

      const newPath = [...path, prop];

      if (typeof value === "function") {
        const procedure = newPath.join(".");
        return async (...args: unknown[]) => {
          const start = Date.now();
          log.info({ procedure }, "trpc.call.start");
          try {
            const result = await (value as (...a: unknown[]) => unknown).apply(
              t,
              args
            );
            log.info(
              {
                procedure,
                duration_ms: Date.now() - start,
                outcome: "ok",
              },
              "trpc.call.end"
            );
            return result;
          } catch (err) {
            log.error(
              {
                procedure,
                duration_ms: Date.now() - start,
                outcome: "error",
                err,
              },
              "trpc.call.end"
            );
            throw err;
          }
        };
      }

      if (value && typeof value === "object") {
        return wrapCallerWithLogging(value as object, log, newPath);
      }

      return value;
    },
  }) as T;
}
