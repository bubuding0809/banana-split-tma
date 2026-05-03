import { describe, it, expect } from "vitest";
import { runWithRequestContext, getRequestId } from "./requestContext.js";

describe("requestContext", () => {
  it("returns undefined when called outside a request scope", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("propagates request_id through awaited callbacks", async () => {
    const observed: (string | undefined)[] = [];
    await runWithRequestContext({ requestId: "01HXY-test" }, async () => {
      observed.push(getRequestId());
      await Promise.resolve();
      observed.push(getRequestId());
      await new Promise((r) => setTimeout(r, 5));
      observed.push(getRequestId());
    });
    expect(observed).toEqual(["01HXY-test", "01HXY-test", "01HXY-test"]);
  });

  it("isolates concurrent contexts", async () => {
    const results = await Promise.all([
      runWithRequestContext({ requestId: "a" }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getRequestId();
      }),
      runWithRequestContext({ requestId: "b" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRequestId();
      }),
    ]);
    expect(results).toEqual(["a", "b"]);
  });
});
