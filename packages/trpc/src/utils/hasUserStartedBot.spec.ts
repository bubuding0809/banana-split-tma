import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { hasUserStartedBot } from "./hasUserStartedBot.js";

const mockDb = {
  chat: { findUnique: vi.fn() },
} as unknown as PrismaClient;

describe("hasUserStartedBot", () => {
  beforeEach(() => vi.resetAllMocks());

  it("true when private Chat row keyed to userId exists", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      id: BigInt(100),
      type: "private",
    });
    expect(await hasUserStartedBot(100, mockDb)).toBe(true);
    expect(mockDb.chat.findUnique).toHaveBeenCalledWith({
      where: { id: BigInt(100) },
      select: { id: true, type: true },
    });
  });

  it("false when no row", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue(null);
    expect(await hasUserStartedBot(100, mockDb)).toBe(false);
  });

  it("false when row exists but type != private", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      id: BigInt(100),
      type: "group",
    });
    expect(await hasUserStartedBot(100, mockDb)).toBe(false);
  });
});
