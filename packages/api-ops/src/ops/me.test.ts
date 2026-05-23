import { describe, it, expect, vi } from "vitest";
import { ApiValidationError } from "@bananasplitz/api-ops";
import { listMyBalances, listMySpending } from "./me.js";

describe("me ops", () => {
  it("listMyBalances calls trpc.expenseShare.getMyBalancesAcrossChats", async () => {
    const queryMock = vi.fn().mockResolvedValue({ balances: [] });
    const trpc = {
      expenseShare: { getMyBalancesAcrossChats: { query: queryMock } },
    } as never;

    await listMyBalances(trpc);

    expect(queryMock).toHaveBeenCalledWith();
  });

  it("listMySpending requires month", async () => {
    const trpc = {} as never;
    await expect(listMySpending(trpc, {})).rejects.toBeInstanceOf(
      ApiValidationError
    );
  });

  it("listMySpending rejects malformed month", async () => {
    const trpc = {} as never;
    await expect(
      listMySpending(trpc, { month: "2026-13" })
    ).rejects.toMatchObject({
      code: "invalid_field",
      message: "--month must be YYYY-MM (e.g. 2026-04)",
    });
  });

  it("listMySpending calls trpc.expenseShare.getMySpendByMonth", async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValue({ month: "2026-04", chats: [], totals: [] });
    const trpc = {
      expenseShare: { getMySpendByMonth: { query: queryMock } },
    } as never;

    await listMySpending(trpc, { month: "2026-04" });

    expect(queryMock).toHaveBeenCalledWith({ month: "2026-04" });
  });
});
