import { describe, it, expect, vi } from "vitest";
import { snapshotCommands } from "./snapshot.js";

vi.mock("../output.js", () => ({
  success: vi.fn((data) => data),
  error: vi.fn((code, message) => ({ code, message })),
  run: vi.fn(async (cmd, fn) => {
    try {
      return await fn();
    } catch (err: any) {
      return { code: "api_error", message: err.message };
    }
  }),
}));

vi.mock("../scope.js", () => ({
  resolveChatId: vi.fn(async (trpc, chatId) => {
    if (chatId) return Number(chatId);
    return 12345;
  }),
}));

describe("snapshot commands", () => {
  it("list-snapshots should call trpc.snapshot.getByChat", async () => {
    const cmd = snapshotCommands.find((c) => c.name === "list-snapshots");
    const queryMock = vi.fn().mockResolvedValue([]);
    const trpcMock = { snapshot: { getByChat: { query: queryMock } } } as any;

    await cmd?.execute({ "chat-id": "111" }, trpcMock);

    expect(queryMock).toHaveBeenCalledWith({ chatId: 111 });
  });

  it("get-snapshot should fail if snapshot-id is missing", async () => {
    const cmd = snapshotCommands.find((c) => c.name === "get-snapshot");
    const trpcMock = {} as any;
    const result = await cmd?.execute({}, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--snapshot-id is required",
    });
  });

  it("get-snapshot should call trpc.snapshot.getDetails", async () => {
    const cmd = snapshotCommands.find((c) => c.name === "get-snapshot");
    const queryMock = vi.fn().mockResolvedValue({ id: "snap-123" });
    const trpcMock = { snapshot: { getDetails: { query: queryMock } } } as any;

    await cmd?.execute({ "snapshot-id": "snap-123" }, trpcMock);

    expect(queryMock).toHaveBeenCalledWith({ snapshotId: "snap-123" });
  });
});
