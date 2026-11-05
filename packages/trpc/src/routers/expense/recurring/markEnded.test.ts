import { describe, it, expect, vi } from "vitest";
import { markEndedTemplates } from "./markEnded.js";
import type { Db } from "../../../trpc.js";

const fakeDb = () => {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  return {
    db: { recurringExpenseTemplate: { updateMany } } as unknown as Db,
    updateMany,
  };
};

describe("markEndedTemplates", () => {
  it("flips ACTIVE templates whose endDate has passed to ENDED", async () => {
    const { db, updateMany } = fakeDb();
    const now = new Date("2026-11-15T00:00:00Z");
    await markEndedTemplates(db, { chatId: 123n }, now);
    expect(updateMany).toHaveBeenCalledWith({
      where: { chatId: 123n, status: "ACTIVE", endDate: { lt: now } },
      data: { status: "ENDED" },
    });
  });

  it("scopes by template id", async () => {
    const { db, updateMany } = fakeDb();
    const now = new Date();
    await markEndedTemplates(db, { id: "t1" }, now);
    expect(updateMany.mock.calls[0]![0].where).toMatchObject({
      id: "t1",
      status: "ACTIVE",
    });
  });
});
