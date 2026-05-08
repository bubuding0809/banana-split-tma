import { describe, it, expect } from "vitest";
import { createLogger } from "@repo/logger";
import { wrapCallerWithLogging } from "./trpcLogger.js";

type LogLine = Record<string, unknown> & { msg: string };

function captureLogger() {
  const lines: string[] = [];
  const log = createLogger("bot", {
    destination: { write: (s) => lines.push(s) },
  });
  return {
    log,
    parsed: () => lines.map((l) => JSON.parse(l) as LogLine),
  };
}

describe("wrapCallerWithLogging — POJO caller", () => {
  it("emits trpc.call.start and trpc.call.end with procedure + duration on success", async () => {
    const { log, parsed } = captureLogger();
    const fakeCaller = {
      expense: {
        getAllExpensesByChat: async (input: { chatId: number }) => {
          await new Promise((r) => setTimeout(r, 5));
          return [{ chatId: input.chatId }];
        },
      },
    };

    const wrapped = wrapCallerWithLogging(fakeCaller, log);
    const result = await wrapped.expense.getAllExpensesByChat({ chatId: 1 });

    expect(result).toEqual([{ chatId: 1 }]);

    const events = parsed();
    const start = events.find((e) => e.msg === "trpc.call.start");
    const end = events.find((e) => e.msg === "trpc.call.end");

    expect(start).toBeDefined();
    expect(start?.procedure).toBe("expense.getAllExpensesByChat");
    expect(end).toBeDefined();
    expect(end?.procedure).toBe("expense.getAllExpensesByChat");
    expect(end?.outcome).toBe("ok");
    expect(end?.duration_ms as number).toBeGreaterThanOrEqual(5);
  });

  it("logs at error level and rethrows on failure", async () => {
    const { log, parsed } = captureLogger();
    const fakeCaller = {
      user: {
        getUser: async () => {
          throw new Error("boom");
        },
      },
    };

    const wrapped = wrapCallerWithLogging(fakeCaller, log);

    await expect(wrapped.user.getUser()).rejects.toThrow("boom");

    const end = parsed().find((e) => e.msg === "trpc.call.end");
    expect(end).toBeDefined();
    expect(end?.outcome).toBe("error");
    expect(end?.procedure).toBe("user.getUser");
    expect(end?.level).toBe(50);
  });

  it("logs nested namespaces with full dotted path", async () => {
    const { log, parsed } = captureLogger();
    const fakeCaller = {
      expense: {
        recurring: {
          list: async () => [],
        },
      },
    };

    const wrapped = wrapCallerWithLogging(fakeCaller, log);
    await wrapped.expense.recurring.list();

    const start = parsed().find((e) => e.msg === "trpc.call.start");
    expect(start?.procedure).toBe("expense.recurring.list");
  });
});

// Mimics tRPC v11 createCaller: every property access yields another
// Proxy whose target is a function. There's no way to syntactically
// distinguish a sub-router from a leaf procedure — only `apply` knows.
function makeRecursiveProxyCaller(
  resolve: (path: string[], args: unknown[]) => unknown
) {
  function build(path: string[]): unknown {
    const fn = function () {};
    return new Proxy(fn, {
      get(_t, prop) {
        if (typeof prop === "symbol") return undefined;
        return build([...path, String(prop)]);
      },
      apply(_t, _thisArg, args) {
        return resolve(path, args);
      },
    });
  }
  return build([]);
}

describe("wrapCallerWithLogging — tRPC v11 recursive Proxy caller", () => {
  it("dispatches to the right procedure path on a recursive-Proxy caller", async () => {
    const { log, parsed } = captureLogger();

    let calledPath: string[] | null = null;
    let calledArgs: unknown[] | null = null;
    const recursive = makeRecursiveProxyCaller((path, args) => {
      calledPath = path;
      calledArgs = args;
      return Promise.resolve([{ id: 42 }]);
    }) as {
      expense: {
        getAllExpensesByChat: (i: { chatId: number }) => Promise<unknown>;
      };
    };

    const wrapped = wrapCallerWithLogging(recursive, log);
    const result = await wrapped.expense.getAllExpensesByChat({ chatId: 7 });

    expect(result).toEqual([{ id: 42 }]);
    expect(calledPath).toEqual(["expense", "getAllExpensesByChat"]);
    expect(calledArgs).toEqual([{ chatId: 7 }]);

    const start = parsed().find((e) => e.msg === "trpc.call.start");
    const end = parsed().find((e) => e.msg === "trpc.call.end");
    expect(start?.procedure).toBe("expense.getAllExpensesByChat");
    expect(end?.outcome).toBe("ok");
  });

  it("handles deeply nested paths on a recursive-Proxy caller (expense.recurring.list)", async () => {
    const { log, parsed } = captureLogger();

    let calledPath: string[] | null = null;
    const recursive = makeRecursiveProxyCaller((path) => {
      calledPath = path;
      return Promise.resolve([]);
    }) as {
      expense: { recurring: { list: () => Promise<unknown> } };
    };

    const wrapped = wrapCallerWithLogging(recursive, log);
    await wrapped.expense.recurring.list();

    expect(calledPath).toEqual(["expense", "recurring", "list"]);
    const start = parsed().find((e) => e.msg === "trpc.call.start");
    expect(start?.procedure).toBe("expense.recurring.list");
  });

  it("propagates errors from a recursive-Proxy caller", async () => {
    const { log, parsed } = captureLogger();

    const recursive = makeRecursiveProxyCaller(() => {
      return Promise.reject(new Error("trpc-boom"));
    }) as {
      user: { getUser: () => Promise<unknown> };
    };

    const wrapped = wrapCallerWithLogging(recursive, log);
    await expect(wrapped.user.getUser()).rejects.toThrow("trpc-boom");

    const end = parsed().find((e) => e.msg === "trpc.call.end");
    expect(end?.outcome).toBe("error");
    expect(end?.level).toBe(50);
  });
});
