import { describe, it, expect, vi } from "vitest";
import { settlementCommands } from "./settlement.js";

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

describe("delete-settlement command", () => {
  it("should fail when settlement-id is missing", async () => {
    const cmd = settlementCommands.find((c) => c.name === "delete-settlement");

    const trpcMock = {} as any;
    const result = await cmd?.execute({}, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--settlement-id is required",
    });
  });

  it("should call trpc.settlement.deleteSettlement with the correct ID", async () => {
    const cmd = settlementCommands.find((c) => c.name === "delete-settlement");

    const mutateMock = vi.fn().mockResolvedValue({ message: "Deleted" });
    const trpcMock = {
      settlement: {
        deleteSettlement: {
          mutate: mutateMock,
        },
      },
    } as any;

    await cmd?.execute({ "settlement-id": "set-123" }, trpcMock);

    expect(mutateMock).toHaveBeenCalledWith({ settlementId: "set-123" });
  });
});
