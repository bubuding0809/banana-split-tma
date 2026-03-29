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
const mockTeleBot = {
  sendMessage: vi.fn(),
  getMe: vi.fn(),
};

describe("shareSnapshotMessage procedure", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTeleBot.getMe.mockResolvedValue({ username: "testbot" });
  });

  it("should throw NOT_FOUND if snapshot does not exist", async () => {
    (mockDb.expenseSnapshot.findUnique as any).mockResolvedValue(null);

    await expect(
      shareSnapshotMessageHandler(
        { snapshotId: "mock-id" },
        mockDb,
        mockTeleBot as any,
        123n
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
        123n
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("should format message correctly, truncate >15 users, and omit 0 damage", async () => {
    // Generate 16 users who owe money
    const shares = Array.from({ length: 16 }).map((_, i) => ({
      userId: BigInt(i + 200),
      amount: "10.00",
      user: { firstName: `User ${i}` },
    }));

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
        debtSimplificationEnabled: false,
      },
      expenses: [
        {
          amount: "160.00",
          payerId: 111n,
          payer: { firstName: "Creator", username: "creator_usr" },
          shares: shares,
        },
        {
          amount: "5.00",
          payerId: 999n,
          payer: { firstName: "Zero User" },
          shares: [
            { userId: 999n, amount: "5.00", user: { firstName: "Zero User" } },
          ], // self share, no debt generated
        },
      ],
    });

    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 12345 });

    await shareSnapshotMessageHandler(
      { snapshotId: "123e4567-e89b-12d3-a456-426614174000" },
      mockDb,
      mockTeleBot as any,
      123n
    );

    expect(mockTeleBot.sendMessage).toHaveBeenCalled();

    const sentMessage = mockTeleBot.sendMessage.mock.calls[0]![1];

    // Assert formatting and escaping
    expect(sentMessage).toContain("Test Snapshot\\! \\(2024\\)"); // Title escaped
    expect(sentMessage).toContain("SGD 165\\.00"); // Total escaped

    // Truncation check
    expect(sentMessage).toContain("User 0");
    expect(sentMessage).toContain("User 14");
    expect(sentMessage).not.toContain("User 15"); // 16th negative user omitted
    expect(sentMessage).toContain("and 1 others\\.\\.\\."); // 16 non-zero users total - 15 displayed

    // Omission checks
    expect(sentMessage).not.toContain("Zero User"); // self share
  });

  it("should completely omit Group Damage section if all users have 0 net balance", async () => {
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
        debtSimplificationEnabled: false,
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
      123n
    );

    const sentMessage = mockTeleBot.sendMessage.mock.calls[0]![1];
    expect(sentMessage).toContain("Total spent");
    expect(sentMessage).toContain("All debts are settled");
  });

  it("should pass message_thread_id if chat has a threadId", async () => {
    (mockDb.expenseSnapshot.findUnique as any).mockResolvedValue({
      id: "mock-id",
      title: "Topic Snapshot",
      chatId: -1001234567890n,
      currency: "SGD",
      creatorId: 111n,
      creator: { firstName: "Creator" },
      chat: {
        type: "group",
        threadId: 555n,
        members: [{ userId: 123n }],
        baseCurrency: "SGD",
      },
      expenses: [],
    });

    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 12345 });
    await shareSnapshotMessageHandler(
      { snapshotId: "mock-id" },
      mockDb,
      mockTeleBot as any,
      123n
    );

    expect(mockTeleBot.sendMessage).toHaveBeenCalled();
    const options = mockTeleBot.sendMessage.mock.calls[0]![2];
    expect(options).toHaveProperty("message_thread_id", 555);
  });

  it("should pass message_thread_id if chat has a threadId", async () => {
    (mockDb.expenseSnapshot.findUnique as any).mockResolvedValue({
      id: "mock-id",
      title: "Topic Snapshot",
      chatId: -1001234567890n,
      currency: "SGD",
      creatorId: 111n,
      creator: { firstName: "Creator" },
      chat: {
        type: "group",
        threadId: 555n,
        members: [{ userId: 123n }],
        baseCurrency: "SGD",
      },
      expenses: [],
    });

    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 12345 });
    await shareSnapshotMessageHandler(
      { snapshotId: "mock-id" },
      mockDb,
      mockTeleBot as any,
      123n
    );

    expect(mockTeleBot.sendMessage).toHaveBeenCalled();
    const options = mockTeleBot.sendMessage.mock.calls[0]![2];
    expect(options).toHaveProperty("message_thread_id", 555);
  });
});
