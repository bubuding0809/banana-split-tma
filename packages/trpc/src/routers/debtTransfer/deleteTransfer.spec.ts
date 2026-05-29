import { describe, it, expect, vi } from "vitest";
import { deleteTransferHandler } from "./deleteTransfer.js";

describe("deleteTransferHandler", () => {
  it("deletes an existing transfer", async () => {
    const del = vi.fn().mockResolvedValue({});
    const db = {
      debtTransfer: {
        findUnique: async () => ({ id: "t1" }),
        delete: del,
      },
    } as never;

    const result = await deleteTransferHandler({ transferId: "t1" }, db);

    expect(result).toEqual({ success: true, id: "t1" });
    expect(del).toHaveBeenCalledWith({ where: { id: "t1" } });
  });

  it("throws NOT_FOUND when the transfer does not exist", async () => {
    const db = {
      debtTransfer: {
        findUnique: async () => null,
        delete: async () => {
          throw new Error("should not be called");
        },
      },
    } as never;

    await expect(
      deleteTransferHandler({ transferId: "missing" }, db)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
