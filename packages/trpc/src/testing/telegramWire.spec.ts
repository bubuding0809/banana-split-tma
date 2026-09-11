import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Telegram } from "telegraf";
import type { PrismaClient } from "@dko/database";
import type { Logger } from "@repo/logger";
import type { Db } from "../trpc.js";
import {
  startFakeTelegramServer,
  type FakeTelegramServer,
} from "./fakeTelegramServer.js";
import { sendExpenseNotificationMessageHandler } from "../routers/telegram/sendExpenseNotificationMessage.js";
import { editExpenseMessageHandler } from "../routers/telegram/editExpenseNotificationMessage.js";
import { editDelivery } from "../services/broadcastActions.js";
import { createBroadcast } from "../services/broadcast.js";

// Wire-level regression guard. Each test drives a real client against a fake
// Bot API server and snapshots the exact request bodies. The snapshot was
// recorded with telegraf; swapping the client library must not change it.

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child() {
    return log;
  },
} as unknown as Logger;

const RUNNER = 259941064n;
const PHOTO = Buffer.from("fake-photo-bytes-for-wire-snapshot");

const expenseInput = {
  chatId: -1002371842523,
  chatType: "group",
  expenseId: "123e4567-e89b-12d3-a456-426614174000",
  payerId: 1,
  payerName: "Alice",
  creatorUserId: 1,
  creatorName: "Alice",
  expenseDescription: "Lunch (wire)",
  totalAmount: 20,
  participants: [
    { userId: 1, name: "Alice", amount: 10 },
    { userId: 2, name: "Bob", amount: 10 },
  ],
  currency: "SGD",
  expenseDate: new Date("2026-04-24T00:00:00Z"),
  chatTimezone: "Asia/Singapore",
  threadId: 147,
};

describe("telegram wire snapshots", () => {
  let server: FakeTelegramServer;
  let teleBot: Telegram;

  beforeAll(async () => {
    server = await startFakeTelegramServer();
    // Task 5 changes only this line to `new Api("123:TEST", { apiRoot: server.url })`.
    teleBot = new Telegram("123:TEST", { apiRoot: server.url });
  });

  afterAll(async () => {
    await server.close();
  });

  it("sendMessage with a url inline keyboard (expense notification)", async () => {
    server.calls.length = 0;
    const db = {
      chat: {
        findUnique: vi.fn().mockResolvedValue({ notifyOnExpense: true }),
      },
    } as unknown as PrismaClient;

    await sendExpenseNotificationMessageHandler(
      { ...expenseInput, force: true },
      db,
      teleBot as never,
      log
    );

    expect(server.calls).toMatchSnapshot();
  });

  it("editMessageText with two url buttons (recurring expense edit)", async () => {
    server.calls.length = 0;

    await editExpenseMessageHandler(
      {
        ...expenseInput,
        messageId: 555,
        recurringTemplateId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      },
      teleBot as never,
      log
    );

    expect(server.calls).toMatchSnapshot();
  });

  it("editMessageText / editMessageCaption / editMessageMedia (broadcast edits)", async () => {
    server.calls.length = 0;
    const delivery = {
      id: "d1",
      userId: RUNNER,
      username: "bubuding0809",
      firstName: "Ruoqian",
      status: "SENT",
      telegramChatId: RUNNER,
      telegramMessageId: 777n,
    };
    const db = {
      broadcastDelivery: {
        findUnique: vi.fn().mockResolvedValue(delivery),
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Db;
    const ctx = { db, teleBot: teleBot as never };

    await editDelivery(ctx, "d1", null, { text: "Plain *edited*" });
    await editDelivery(ctx, "d1", "PHOTO", { text: "Caption *edited*" });
    await editDelivery(ctx, "d1", "PHOTO", {
      text: "Media swapped",
      media: { kind: "photo", buffer: PHOTO, filename: "swap.png" },
    });

    expect(server.calls).toMatchSnapshot();
  });

  it("sendPhoto multipart upload (broadcast with photo)", async () => {
    server.calls.length = 0;
    const tx = {
      broadcast: { create: vi.fn().mockResolvedValue({ id: "b1" }) },
      broadcastDelivery: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([{ id: "d1", userId: RUNNER }]),
      },
    };
    const db = {
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: RUNNER, username: "bubuding0809", firstName: "Ruoqian" },
          ]),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
      broadcast: { update: vi.fn().mockResolvedValue({}) },
      broadcastDelivery: { update: vi.fn().mockResolvedValue({}) },
    } as unknown as Db;

    await createBroadcast(
      { db, teleBot: teleBot as never, log },
      {
        message: "Hello *world*",
        targetUserIds: [Number(RUNNER)],
        media: { kind: "photo", buffer: PHOTO, filename: "hello.png" },
        createdByTelegramId: null,
      }
    );

    expect(server.calls).toMatchSnapshot();
  });
});
