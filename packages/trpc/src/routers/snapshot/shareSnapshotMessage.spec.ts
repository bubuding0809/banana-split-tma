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

  it("should render per-pax shares sorted desc with tree prefixes and truncate >15 users", async () => {
    // 16 users, each with a distinct share amount so sort order is deterministic
    const shares = Array.from({ length: 16 }).map((_, i) => ({
      userId: BigInt(i + 200),
      amount: (100 - i).toFixed(2), // User 0 = 100.00, User 15 = 85.00
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
      },
      expenses: [
        {
          amount: "1480.00", // sum of shares 100+99+...+85 = 1480
          payerId: 111n,
          payer: { firstName: "Creator", username: "creator_usr" },
          shares: shares,
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

    // Header + total escaping
    expect(sentMessage).toContain("Test Snapshot\\! \\(2024\\)");
    expect(sentMessage).toContain("SGD 1,480\\.00");
    expect(sentMessage).toContain("🧾 *Shares*");

    // Shares rendering — top 15 shown (highest first), 16th truncated
    expect(sentMessage).toContain("User 0"); // share 100
    expect(sentMessage).toContain("User 14"); // share 86
    expect(sentMessage).not.toContain("User 15"); // share 85 — truncated

    // Tree prefixes present — ┣ for mid, ┗ for last shown entry
    expect(sentMessage).toContain("┣");
    expect(sentMessage).toContain("┗");

    // Truncation summary
    expect(sentMessage).toContain("and 1 others\\.\\.\\.");
  });

  it("should omit Shares block when no shares exist", async () => {
    (mockDb.expenseSnapshot.findUnique as any).mockResolvedValue({
      id: "mock-id",
      title: "Empty Snapshot",
      chatId: -1001234567890n,
      currency: "SGD",
      creatorId: 111n,
      creator: { firstName: "Creator" },
      chat: {
        type: "group",
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

    const sentMessage = mockTeleBot.sendMessage.mock.calls[0]![1];
    expect(sentMessage).toContain("Total spent");
    expect(sentMessage).not.toContain("🧾 *Shares*");
  });

  it("should aggregate shares across multiple expenses per user", async () => {
    (mockDb.expenseSnapshot.findUnique as any).mockResolvedValue({
      id: "mock-id",
      title: "Multi Expense",
      chatId: -1001234567890n,
      currency: "SGD",
      creatorId: 111n,
      creator: { firstName: "Ruoqian", username: "ruoqian" },
      chat: {
        type: "group",
        members: [{ userId: 123n }],
        baseCurrency: "SGD",
      },
      expenses: [
        {
          amount: "60.00",
          payerId: 111n,
          payer: { firstName: "Ruoqian", username: "ruoqian" },
          shares: [
            {
              userId: 111n,
              amount: "30.00",
              user: { firstName: "Ruoqian", username: "ruoqian" },
            },
            {
              userId: 222n,
              amount: "30.00",
              user: { firstName: "Ting", username: "xuetingg" },
            },
          ],
        },
        {
          amount: "40.00",
          payerId: 222n,
          payer: { firstName: "Ting", username: "xuetingg" },
          shares: [
            {
              userId: 111n,
              amount: "10.00",
              user: { firstName: "Ruoqian", username: "ruoqian" },
            },
            {
              userId: 222n,
              amount: "30.00",
              user: { firstName: "Ting", username: "xuetingg" },
            },
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

    // Total = 100.00
    expect(sentMessage).toContain("SGD 100\\.00");

    // Ting total share = 60 (30 + 30)
    expect(sentMessage).toContain("@xuetingg: SGD 60\\.00");
    // Ruoqian total share = 40 (30 + 10)
    expect(sentMessage).toContain("@ruoqian: SGD 40\\.00");

    // Tree ordering: ting (larger) uses ┣, ruoqian (last) uses ┗
    const tingIdx = sentMessage.indexOf("@xuetingg");
    const ruoIdx = sentMessage.indexOf("@ruoqian:");
    expect(tingIdx).toBeGreaterThan(-1);
    expect(ruoIdx).toBeGreaterThan(tingIdx);
    // @xuetingg line should start with ┣ (not last), @ruoqian with ┗ (last)
    expect(sentMessage).toMatch(/┣ @xuetingg: SGD 60\\\.00/);
    expect(sentMessage).toMatch(/┗ @ruoqian: SGD 40\\\.00/);
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
