import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { nudgeCounterpartyHandler } from "./nudgeCounterparty.js";

const caller = 100;
const mockDb = { user: { findUnique: vi.fn() } } as unknown as PrismaClient;

const deps = {
  getCounterpartyBalances: vi.fn(),
  sendDm: vi.fn(),
  takeToken: vi.fn(),
};

const owedFresh = {
  baseCurrency: "SGD",
  ratesAsOf: new Date(),
  counterparties: [
    {
      userId: 200,
      firstName: "Sean",
      lastName: null,
      hasStartedBot: true,
      totalBaseNet: 99.42,
      groups: [
        {
          chatId: 1,
          chatTitle: "Bali",
          currency: "USD",
          nativeNet: 40,
          baseNet: 54.2,
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  (mockDb.user.findUnique as any).mockResolvedValue({
    firstName: "Bubu",
    lastName: null,
  });
});

describe("nudgeCounterpartyHandler", () => {
  it("rate-limits when token bucket refuses", async () => {
    deps.takeToken.mockReturnValue(false);
    await expect(
      nudgeCounterpartyHandler(
        { callerId: caller, counterpartyUserId: 200 },
        mockDb,
        deps
      )
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(deps.sendDm).not.toHaveBeenCalled();
  });

  it("rejects when caller is not net-owed by counterparty", async () => {
    deps.takeToken.mockReturnValue(true);
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD",
      ratesAsOf: new Date(),
      counterparties: [{ ...owedFresh.counterparties[0], totalBaseNet: -10 }],
    });
    await expect(
      nudgeCounterpartyHandler(
        { callerId: caller, counterpartyUserId: 200 },
        mockDb,
        deps
      )
    ).rejects.toThrow(/nothing.*nudge/i);
  });

  it("rejects when counterparty has not started the bot", async () => {
    deps.takeToken.mockReturnValue(true);
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD",
      ratesAsOf: new Date(),
      counterparties: [
        { ...owedFresh.counterparties[0], hasStartedBot: false },
      ],
    });
    await expect(
      nudgeCounterpartyHandler(
        { callerId: caller, counterpartyUserId: 200 },
        mockDb,
        deps
      )
    ).rejects.toThrow(/bot/i);
  });

  it("sends DM and consumes token on happy path", async () => {
    deps.takeToken.mockReturnValue(true);
    deps.getCounterpartyBalances.mockResolvedValue(owedFresh);
    await nudgeCounterpartyHandler(
      { callerId: caller, counterpartyUserId: 200 },
      mockDb,
      deps
    );
    expect(deps.takeToken).toHaveBeenCalledWith("nudge:100:200", 1, 86400000);
    expect(deps.sendDm).toHaveBeenCalledWith(
      200,
      expect.stringContaining("Bubu")
    );
  });
});
