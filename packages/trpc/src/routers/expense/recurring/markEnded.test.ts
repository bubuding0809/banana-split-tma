import { describe, it, expect, vi } from "vitest";
import { markEndedTemplates, statusAfterEndDateEdit } from "./markEnded.js";
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

describe("statusAfterEndDateEdit", () => {
  const now = new Date("2026-11-15T00:00:00Z");
  it("revives ENDED when the new end date is in the future", () => {
    expect(
      statusAfterEndDateEdit("ENDED", new Date("2026-12-31T00:00:00Z"), now)
    ).toBe("ACTIVE");
  });
  it("revives ENDED when the end date is cleared", () => {
    expect(statusAfterEndDateEdit("ENDED", null, now)).toBe("ACTIVE");
  });
  it("keeps ENDED when the new end date is still past", () => {
    expect(
      statusAfterEndDateEdit("ENDED", new Date("2026-11-01T00:00:00Z"), now)
    ).toBe("ENDED");
  });
  it("never revives CANCELED", () => {
    expect(statusAfterEndDateEdit("CANCELED", null, now)).toBe("CANCELED");
  });
  it("leaves ACTIVE alone", () => {
    expect(statusAfterEndDateEdit("ACTIVE", null, now)).toBe("ACTIVE");
  });
});
