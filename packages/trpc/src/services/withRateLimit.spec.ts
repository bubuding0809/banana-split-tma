import { describe, expect, it, vi } from "vitest";
import { withRateLimit } from "./withRateLimit.js";

describe("withRateLimit", () => {
  it("runs each item serially and sleeps between them", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const run = withRateLimit(100)(async (n: number) => {
      order.push(`start-${n}`);
      await Promise.resolve();
      order.push(`end-${n}`);
      return n * 2;
    });

    const promise = Promise.all([run(1), run(2)]);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([2, 4]);
    expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
    vi.useRealTimers();
  });
});
