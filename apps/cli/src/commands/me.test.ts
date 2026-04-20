import { describe, it, expect, vi } from "vitest";
import { meCommands } from "./me.js";

vi.mock("../output.js", () => ({
  success: vi.fn((data) => data),
  error: vi.fn((code, message, command) => ({ code, message, command })),
  run: vi.fn(async (cmd, fn) => {
    try {
      return await fn();
    } catch (err: any) {
      return { code: "api_error", message: err.message };
    }
  }),
}));

describe("me commands", () => {
  it("list-my-balances calls trpc.expenseShare.getMyBalancesAcrossChats", async () => {
    const cmd = meCommands.find((c) => c.name === "list-my-balances");
    const queryMock = vi.fn().mockResolvedValue({ balances: [] });
    const trpcMock = {
      expenseShare: { getMyBalancesAcrossChats: { query: queryMock } },
    } as any;

    await cmd?.execute({}, trpcMock);

    expect(queryMock).toHaveBeenCalledWith();
  });

  it("list-my-spending requires --month", async () => {
    const cmd = meCommands.find((c) => c.name === "list-my-spending");
    const trpcMock = {} as any;

    const result = await cmd?.execute({}, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--month is required",
    });
  });

  it("list-my-spending rejects malformed --month", async () => {
    const cmd = meCommands.find((c) => c.name === "list-my-spending");
    const trpcMock = {} as any;

    const result = await cmd?.execute({ month: "2026-13" }, trpcMock);

    expect(result).toMatchObject({
      code: "invalid_option",
      message: "--month must be YYYY-MM (e.g. 2026-04)",
    });
  });

  it("list-my-spending calls trpc.expenseShare.getMySpendByMonth with parsed month", async () => {
    const cmd = meCommands.find((c) => c.name === "list-my-spending");
    const queryMock = vi
      .fn()
      .mockResolvedValue({ month: "2026-04", chats: [], totals: [] });
    const trpcMock = {
      expenseShare: { getMySpendByMonth: { query: queryMock } },
    } as any;

    await cmd?.execute({ month: "2026-04" }, trpcMock);

    expect(queryMock).toHaveBeenCalledWith({ month: "2026-04" });
  });
});
