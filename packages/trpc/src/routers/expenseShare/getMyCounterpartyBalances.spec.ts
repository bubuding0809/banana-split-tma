import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { getMyCounterpartyBalancesHandler } from "./getMyCounterpartyBalances.js";

const caller = 100;

const fakeAcrossChats = {
  balances: [
    {
      chatId: 1,
      chatTitle: "Bali Trip",
      debtSimplificationEnabled: false,
      currencies: [{ currency: "USD", net: 40 }],
      counterparties: [{ userId: 200, name: "Sean", currency: "USD", net: 40 }],
    },
    {
      chatId: 2,
      chatTitle: "Dinner Club",
      debtSimplificationEnabled: false,
      currencies: [{ currency: "AUD", net: 30 }],
      counterparties: [{ userId: 200, name: "Sean", currency: "AUD", net: 30 }],
    },
    {
      chatId: 3,
      chatTitle: "Roommates",
      debtSimplificationEnabled: false,
      currencies: [{ currency: "SGD", net: 50 }],
      counterparties: [{ userId: 300, name: "Bob", currency: "SGD", net: 50 }],
    },
  ],
};

const ratesByBase = {
  USD: { USD: 1, SGD: 1.355, AUD: 1.5 },
  SGD: { USD: 0.738, SGD: 1, AUD: 1.107 },
};

const mockDb = {
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  chat: { findUnique: vi.fn() },
} as unknown as PrismaClient;

const deps = {
  getAcrossChats: vi.fn(),
  fetchRates: vi.fn(),
};

describe("getMyCounterpartyBalancesHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    deps.getAcrossChats.mockResolvedValue(fakeAcrossChats);
    deps.fetchRates.mockImplementation(
      async (base: string) => ratesByBase[base as "USD" | "SGD"]
    );
    (mockDb.user.findUnique as any).mockResolvedValue({ baseCurrency: "SGD" });
    (mockDb.user.findMany as any).mockResolvedValue([
      { id: BigInt(200), firstName: "Sean", lastName: null },
      { id: BigInt(300), firstName: "Bob", lastName: null },
    ]);
    (mockDb.chat.findUnique as any).mockImplementation(
      async ({ where: { id } }: any) => {
        const n = Number(id);
        if (n === 200 || n === 300) return { id, type: "private" };
        return null;
      }
    );
  });

  it("groups by counterparty and sums in baseCurrency", async () => {
    const result = await getMyCounterpartyBalancesHandler(
      { callerId: caller, baseCurrency: "SGD" },
      mockDb,
      deps
    );

    expect(result.baseCurrency).toBe("SGD");
    const sean = result.counterparties.find((c) => c.userId === 200)!;
    expect(sean.groups).toHaveLength(2);
    // 40 USD ≈ 54.2 SGD ; 30 AUD via USD ≈ 27.10 SGD ; sum ≈ 81.3
    expect(sean.totalBaseNet).toBeCloseTo(81.3, 1);
    expect(sean.hasStartedBot).toBe(true);

    const bob = result.counterparties.find((c) => c.userId === 300)!;
    expect(bob.totalBaseNet).toBeCloseTo(50, 6);
  });

  it("sorts counterparties by |totalBaseNet| desc", async () => {
    const result = await getMyCounterpartyBalancesHandler(
      { callerId: caller, baseCurrency: "SGD" },
      mockDb,
      deps
    );
    expect(result.counterparties.map((c) => c.userId)).toEqual([200, 300]);
  });

  it("filters counterparties whose baseNet rounds to zero", async () => {
    deps.getAcrossChats.mockResolvedValue({
      balances: [
        {
          chatId: 1,
          chatTitle: "X",
          debtSimplificationEnabled: false,
          currencies: [{ currency: "SGD", net: 0.001 }],
          counterparties: [
            { userId: 200, name: "Sean", currency: "SGD", net: 0.001 },
          ],
        },
      ],
    });
    const result = await getMyCounterpartyBalancesHandler(
      { callerId: caller, baseCurrency: "SGD" },
      mockDb,
      deps
    );
    expect(result.counterparties).toHaveLength(0);
  });

  it("uses caller's stored baseCurrency when input omits it", async () => {
    (mockDb.user.findUnique as any).mockResolvedValue({ baseCurrency: "USD" });
    const result = await getMyCounterpartyBalancesHandler(
      { callerId: caller },
      mockDb,
      deps
    );
    expect(result.baseCurrency).toBe("USD");
    expect(deps.fetchRates).toHaveBeenCalledWith("USD");
  });

  it("drops counterparties whose User row no longer exists", async () => {
    // Only Bob (300) is returned from findMany; Sean (200) has vanished
    (mockDb.user.findMany as any).mockResolvedValue([
      { id: BigInt(300), firstName: "Bob", lastName: null },
    ]);
    const result = await getMyCounterpartyBalancesHandler(
      { callerId: caller, baseCurrency: "SGD" },
      mockDb,
      deps
    );
    expect(result.counterparties.map((c) => c.userId)).toEqual([300]);
  });
});
