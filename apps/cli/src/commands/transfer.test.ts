import { describe, it, expect, vi } from "vitest";
import { transferCommands } from "./transfer.js";

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

describe("transfer commands", () => {
  it("create-transfer fails when required options are missing", async () => {
    const cmd = transferCommands.find((c) => c.name === "create-transfer");
    const trpcMock = {} as any;

    expect(await cmd?.execute({}, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--from-chat is required",
    });

    expect(await cmd?.execute({ "from-chat": "100" }, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--to-chat is required",
    });

    expect(
      await cmd?.execute({ "from-chat": "100", "to-chat": "200" }, trpcMock)
    ).toMatchObject({
      code: "missing_option",
      message: "--debtor is required",
    });

    expect(
      await cmd?.execute(
        { "from-chat": "100", "to-chat": "200", debtor: "2" },
        trpcMock
      )
    ).toMatchObject({
      code: "missing_option",
      message: "--creditor is required",
    });

    expect(
      await cmd?.execute(
        { "from-chat": "100", "to-chat": "200", debtor: "2", creditor: "3" },
        trpcMock
      )
    ).toMatchObject({
      code: "missing_option",
      message: "--amount is required",
    });
  });

  it("create-transfer calls trpc.debtTransfer.createTransfer with parsed args", async () => {
    const cmd = transferCommands.find((c) => c.name === "create-transfer");
    const mutateMock = vi.fn().mockResolvedValue({ id: "transfer-1" });
    const trpcMock = {
      debtTransfer: { createTransfer: { mutate: mutateMock } },
    } as any;

    await cmd?.execute(
      {
        "from-chat": "100",
        "to-chat": "200",
        debtor: "2",
        creditor: "3",
        amount: "71.79",
        currency: "SGD",
        description: "Trip consolidation",
      },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledWith({
      sourceChatId: 100,
      targetChatId: 200,
      debtorId: 2,
      creditorId: 3,
      amount: 71.79,
      currency: "SGD",
      description: "Trip consolidation",
    });
  });

  it("create-transfer omits optional currency/description when not provided", async () => {
    const cmd = transferCommands.find((c) => c.name === "create-transfer");
    const mutateMock = vi.fn().mockResolvedValue({ id: "transfer-2" });
    const trpcMock = {
      debtTransfer: { createTransfer: { mutate: mutateMock } },
    } as any;

    await cmd?.execute(
      {
        "from-chat": "100",
        "to-chat": "200",
        debtor: "2",
        creditor: "3",
        amount: "10",
      },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledWith({
      sourceChatId: 100,
      targetChatId: 200,
      debtorId: 2,
      creditorId: 3,
      amount: 10,
      currency: undefined,
      description: undefined,
    });
  });
});
