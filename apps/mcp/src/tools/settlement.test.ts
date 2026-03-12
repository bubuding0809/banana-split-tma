import { describe, it, expect, vi } from "vitest";
import { registerSettlementTools } from "./settlement.js";

vi.mock("./utils.js", () => ({
  toolHandler: vi.fn((name, fn) => fn),
}));

describe("MCP Settlement Tools", () => {
  it("banana_delete_settlement should call trpc mutation", async () => {
    const serverMock = {
      registerTool: vi.fn(),
    } as any;

    const mutateMock = vi
      .fn()
      .mockResolvedValue({ message: "Deleted successfully" });
    const trpcMock = {
      settlement: {
        deleteSettlement: { mutate: mutateMock },
      },
    } as any;

    registerSettlementTools(serverMock, trpcMock);

    const callArgs = serverMock.registerTool.mock.calls.find(
      (args: any[]) => args[0] === "banana_delete_settlement"
    );
    expect(callArgs).toBeDefined();

    const handler = callArgs[2];
    const result = await handler({ settlement_id: "set-123" });

    expect(mutateMock).toHaveBeenCalledWith({ settlementId: "set-123" });
    expect(result.content[0].text).toContain("Deleted successfully");
  });
});
