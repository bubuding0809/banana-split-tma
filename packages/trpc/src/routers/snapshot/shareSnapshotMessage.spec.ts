import { describe, it, expect, vi, beforeEach } from "vitest";
import { shareSnapshotMessageHandler } from "./shareSnapshotMessage.js";
import type { PrismaClient } from "@dko/database";

// Mock dependencies
const mockDb = {
  expenseSnapshot: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
} as unknown as PrismaClient;
const mockTeleBot = { sendMessage: vi.fn() };

describe("shareSnapshotMessage procedure", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "testbot");
    vi.stubEnv("TELEGRAM_APP_NAME", "testapp");
  });

  it("should throw NOT_FOUND if snapshot does not exist", async () => {
    (mockDb.expenseSnapshot.findUnique as any).mockResolvedValue(null);

    await expect(
      shareSnapshotMessageHandler(
        { snapshotId: "mock-id" },
        mockDb,
        mockTeleBot as any,
        123n,
        "testbot",
        "testapp"
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("should throw FORBIDDEN if user is not a member of the chat", async () => {
    (mockDb.expenseSnapshot.findUnique as any).mockResolvedValue({
      id: "mock-id",
      chat: { members: [] }, // Caller is not a member (empty array)
      expenses: [],
      creator: { firstName: "Test" },
    });

    await expect(
      shareSnapshotMessageHandler(
        { snapshotId: "mock-id" },
        mockDb,
        mockTeleBot as any,
        123n,
        "testbot",
        "testapp"
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("should throw TOO_MANY_REQUESTS if shared within the last 60 seconds", async () => {
    const recentDate = new Date();
    recentDate.setSeconds(recentDate.getSeconds() - 30); // 30 seconds ago

    (mockDb.expenseSnapshot.findUnique as any).mockResolvedValue({
      id: "mock-id",
      lastSharedAt: recentDate,
      chat: { members: [{ userId: 123n }] },
      expenses: [],
      creator: { firstName: "Test" },
    });

    await expect(
      shareSnapshotMessageHandler(
        { snapshotId: "mock-id" },
        mockDb,
        mockTeleBot as any,
        123n,
        "testbot",
        "testapp"
      )
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("should format message correctly, truncate >15 users, and omit 0 damage", async () => {
    // Generate 16 users who owe money
    const shares = Array.from({ length: 16 }).map((_, i) => ({
      userId: BigInt(i + 200),
      amount: "10.00",
      user: { firstName: `User ${i}` },
    }));

    // Add one user who paid but doesn't owe (positive balance)
    shares.push({
      userId: 111n,
      amount: "0.00",
      user: { firstName: "Creator" },
    });

    // Add one user whose net balance is exactly 0
    shares.push({
      userId: 999n,
      amount: "5.00",
      user: { firstName: "Zero User" },
    });

    (mockDb.expenseSnapshot.findUnique as any).mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      title: "Test Snapshot! (2024)",
      chatId: -1001234567890n,
      currency: "SGD",
      creatorId: 111n,
      creator: { firstName: "Creator", username: "creator_usr" },
      chat: {
        type: "group",
        members: [{ userId: 123n }],
        baseCurrency: "SGD",
      },
      expenses: [
        {
          amount: "165.00",
          payerId: 111n,
          payer: { firstName: "Creator", username: "creator_usr" },
          shares: shares,
        },
        {
          amount: "5.00",
          payerId: 999n, // Zero User paid 5, and their share above is 5, net = 0
          payer: { firstName: "Zero User" },
          shares: [],
        },
      ],
    });

    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 12345 });

    await shareSnapshotMessageHandler(
      { snapshotId: "123e4567-e89b-12d3-a456-426614174000" },
      mockDb,
      mockTeleBot as any,
      123n,
      "testbot",
      "testapp"
    );

    expect(mockDb.expenseSnapshot.update).toHaveBeenCalled();
    expect(mockTeleBot.sendMessage).toHaveBeenCalled();

    const sentMessage = mockTeleBot.sendMessage.mock.calls[0]![1];

    // Assert formatting and escaping
    expect(sentMessage).toContain("Test Snapshot\\! \\(2024\\)"); // Title escaped
    expect(sentMessage).toContain("SGD 170\\.00"); // Total escaped

    // Truncation check
    expect(sentMessage).toContain("User 0");
    expect(sentMessage).toContain("User 14");
    expect(sentMessage).not.toContain("User 15"); // 16th user omitted
    expect(sentMessage).toContain("and 1 others\\.\\.\\.");

    // Omission checks
    expect(sentMessage).not.toContain("Zero User");
    expect(sentMessage).not.toContain("damage.*Creator");
  });

  it("should completely omit Group Damage section if all users have 0 net damage", async () => {
    (mockDb.expenseSnapshot.findUnique as any).mockResolvedValue({
      id: "mock-id",
      title: "Empty Damage",
      chatId: -1001234567890n,
      currency: "SGD",
      creatorId: 111n,
      creator: { firstName: "Creator" },
      chat: {
        type: "group",
        members: [{ userId: 123n }],
        baseCurrency: "SGD",
      },
      expenses: [
        {
          amount: "10.00",
          payerId: 111n,
          payer: { firstName: "Creator" },
          shares: [
            { userId: 111n, amount: "10.00", user: { firstName: "Creator" } },
          ],
        },
      ],
    });

    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 12345 });
    await shareSnapshotMessageHandler(
      { snapshotId: "mock-id" },
      mockDb,
      mockTeleBot as any,
      123n,
      "testbot",
      "testapp"
    );

    const sentMessage = mockTeleBot.sendMessage.mock.calls[0]![1];
    expect(sentMessage).toContain("Total spent");
    expect(sentMessage).not.toContain("Group Damage:");
  });
});
