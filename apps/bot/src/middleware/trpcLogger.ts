import type { Logger } from "@repo/logger";

// Wrap a tRPC caller so every leaf procedure call emits trpc.call.start /
// trpc.call.end with the dotted procedure path and duration.
//
// IMPORTANT: tRPC v11's createCaller returns a recursive Proxy where every
// property access (sub-router OR procedure) yields another Proxy whose
// target is a function. There is no syntactic way to tell a sub-router
// from a leaf procedure until invocation. So this wrapper builds its own
// recursive Proxy: each property access extends the path; only `apply`
// resolves the call by walking the original caller from the root.
//
// On apply we do `rootCaller.expense.getAllExpensesByChat(...args)` —
// which triggers tRPC's own Proxy chain to dispatch the procedure.
//
// `then` is explicitly returned as `undefined` so that `await wrapper`
// (e.g. someone forgetting parens) doesn't get coerced into a thenable
// and trigger an infinite proxy chain.
export function wrapCallerWithLogging<T extends object>(
  rootCaller: T,
  log: Logger
): T {
  function build(path: readonly string[]): unknown {
    // Function target so `typeof proxy === "function"` and `apply` works.
    const fakeFn = function () {};
    return new Proxy(fakeFn, {
      get(_target, prop) {
        if (typeof prop === "symbol") return undefined;
        if (prop === "then") return undefined;
        return build([...path, prop]);
      },
      apply(_target, _thisArg, args) {
        const procedure = path.join(".");
        const start = Date.now();
        log.info({ procedure }, "trpc.call.start");

        // Walk the original caller via the captured path.
        let target: unknown = rootCaller;
        for (const seg of path) {
          target = (target as Record<string, unknown>)[seg];
        }

        if (typeof target !== "function") {
          const err = new Error(
            `trpc-logger: path "${procedure}" is not callable`
          );
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

        // Direct call (`target(...args)`) so that for recursive-Proxy
        // callers (tRPC v11), the apply trap fires with the captured
        // path. Going through `.apply` would first hit the `get` trap
        // for "apply", extending the path incorrectly.
        return Promise.resolve(
          (target as (...a: unknown[]) => unknown)(...args)
        ).then(
          (result) => {
            log.info(
              {
                procedure,
                duration_ms: Date.now() - start,
                outcome: "ok",
              },
              "trpc.call.end"
            );
            return result;
          },
          (err: unknown) => {
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
        );
      },
    });
  }
  return build([]) as T;
}
