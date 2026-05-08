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

describe("wrapCallerWithLogging", () => {
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
    expect(end?.level).toBe(50); // pino error level
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
