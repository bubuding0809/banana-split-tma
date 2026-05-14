import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { settleAllWithUserHandler } from "./settleAllWithUser.js";

const caller = 100;

const mockDb = {
  $transaction: vi.fn(),
  settlement: { create: vi.fn() },
  user: { findUnique: vi.fn() },
} as unknown as PrismaClient;

const deps = {
  getCounterpartyBalances: vi.fn(),
  sendDm: vi.fn(),
  getBotUsername: vi.fn().mockResolvedValue("BananaSplitzStgBot"),
};

beforeEach(() => {
  vi.resetAllMocks();
  (mockDb.$transaction as any).mockImplementation(async (fn: any) =>
    fn(mockDb)
  );
  (mockDb.user.findUnique as any).mockResolvedValue({
    firstName: "Bubu",
    lastName: null,
  });
  deps.getBotUsername.mockResolvedValue("BananaSplitzStgBot");
});

describe("settleAllWithUserHandler", () => {
  it("writes one Settlement per non-zero bucket in correct direction", async () => {
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD",
      ratesAsOf: new Date(),
      counterparties: [
        {
          userId: 200,
          firstName: "Sean",
          lastName: null,
          hasStartedBot: true,
          totalBaseNet: 50,
          groups: [
            {
              chatId: 1,
              chatTitle: "Bali",
              currency: "USD",
              nativeNet: 40,
              baseNet: 54.2,
            },
            {
              chatId: 2,
              chatTitle: "Dinner",
              currency: "AUD",
              nativeNet: -10,
              baseNet: -7.4,
            },
          ],
        },
      ],
    });

    await settleAllWithUserHandler(
      { callerId: caller, counterpartyUserId: 200 },
      mockDb,
      deps
    );

    expect(mockDb.settlement.create).toHaveBeenCalledTimes(2);
    // bucket 1: Sean owes caller 40 USD → sender=Sean, receiver=caller
    expect(mockDb.settlement.create).toHaveBeenCalledWith({
      data: {
        chatId: BigInt(1),
        senderId: BigInt(200),
        receiverId: BigInt(caller),
        amount: 40,
        currency: "USD",
      },
    });
    // bucket 2: caller owes Sean 10 AUD → sender=caller, receiver=Sean
    expect(mockDb.settlement.create).toHaveBeenCalledWith({
      data: {
        chatId: BigInt(2),
        senderId: BigInt(caller),
        receiverId: BigInt(200),
        amount: 10,
        currency: "AUD",
      },
    });
  });

  it("skips DM when counterparty has not started bot", async () => {
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD",
      ratesAsOf: new Date(),
      counterparties: [
        {
          userId: 200,
          firstName: "Sean",
          lastName: null,
          hasStartedBot: false,
          totalBaseNet: 50,
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
    });
    await settleAllWithUserHandler(
      { callerId: caller, counterpartyUserId: 200 },
      mockDb,
      deps
    );
    expect(deps.sendDm).not.toHaveBeenCalled();
  });

  it("sends DM when counterparty has started bot", async () => {
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD",
      ratesAsOf: new Date(),
      counterparties: [
        {
          userId: 200,
          firstName: "Sean",
          lastName: null,
          hasStartedBot: true,
          totalBaseNet: 54.2,
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
    });
    await settleAllWithUserHandler(
      { callerId: caller, counterpartyUserId: 200 },
      mockDb,
      deps
    );
    expect(deps.sendDm).toHaveBeenCalledWith(
      200,
      expect.stringContaining("Bubu"),
      expect.objectContaining({
        inline_keyboard: [
          [
            expect.objectContaining({
              text: "📊 View Balances",
              url: expect.stringMatching(
                /^https:\/\/t\.me\/BananaSplitzStgBot\?startapp=v1_p_/
              ),
            }),
          ],
        ],
      })
    );
  });

  it("throws when counterparty has zero balance", async () => {
    deps.getCounterpartyBalances.mockResolvedValue({
      baseCurrency: "SGD",
      ratesAsOf: new Date(),
      counterparties: [],
    });
    await expect(
      settleAllWithUserHandler(
        { callerId: caller, counterpartyUserId: 200 },
        mockDb,
        deps
      )
    ).rejects.toThrow(/no.*balance/i);
  });
});
