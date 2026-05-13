import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { updateUserHandler } from "./updateUser.js";

const mockDb = {
  user: { update: vi.fn(), findUnique: vi.fn() },
} as unknown as PrismaClient;

describe("updateUserHandler — baseCurrency", () => {
  beforeEach(() => vi.resetAllMocks());

  it("persists baseCurrency when provided", async () => {
    (mockDb.user.findUnique as any).mockResolvedValue({
      id: BigInt(100),
      firstName: "Bubu",
      lastName: null,
    });
    (mockDb.user.update as any).mockResolvedValue({
      id: BigInt(100),
      firstName: "Bubu",
      lastName: null,
      baseCurrency: "USD",
    });

    const result = await updateUserHandler(
      { userId: BigInt(100), baseCurrency: "USD" },
      mockDb
    );

    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: BigInt(100) },
      data: { baseCurrency: "USD" },
      select: expect.objectContaining({ baseCurrency: true }),
    });
    expect(result.baseCurrency).toBe("USD");
  });

  it("normalises lowercase currency to uppercase before persisting", async () => {
    (mockDb.user.findUnique as any).mockResolvedValue({ id: BigInt(100) });
    (mockDb.user.update as any).mockResolvedValue({
      id: BigInt(100),
      firstName: "Bubu",
      lastName: null,
      baseCurrency: "USD",
    });

    await updateUserHandler(
      { userId: BigInt(100), baseCurrency: "usd" },
      mockDb
    );

    expect(mockDb.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { baseCurrency: "USD" } })
    );
  });

  it("rejects unknown currency code", async () => {
    await expect(
      updateUserHandler({ userId: BigInt(100), baseCurrency: "ZZZ" }, mockDb)
    ).rejects.toThrow(/baseCurrency/i);
  });
});
