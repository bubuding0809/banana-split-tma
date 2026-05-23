import { describe, it, expect, vi } from "vitest";
import { ApiValidationError } from "../errors.js";
import {
  createSnapshot,
  validateCreateSnapshotInput,
  validateSnapshotId,
} from "./snapshot.js";

vi.mock("@bananasplitz/api-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@bananasplitz/api-client")>();
  return {
    ...actual,
    resolveChatId: vi.fn(async () => 12345),
  };
});

describe("snapshot ops", () => {
  it("validateSnapshotId throws when missing", () => {
    expect(() => validateSnapshotId(undefined)).toThrow(ApiValidationError);
  });

  it("validateCreateSnapshotInput validates required fields", () => {
    expect(() => validateCreateSnapshotInput({})).toThrow(ApiValidationError);
    expect(() => validateCreateSnapshotInput({ creatorId: "abc" })).toThrow(
      ApiValidationError
    );
  });

  it("createSnapshot calls trpc.snapshot.create", async () => {
    const mutateMock = vi.fn().mockResolvedValue({ id: "snap-1" });
    const trpc = { snapshot: { create: { mutate: mutateMock } } } as never;

    await createSnapshot(trpc, {
      creatorId: 123,
      title: "Trip",
      expenseIds: ["a", "b"],
    });

    expect(mutateMock).toHaveBeenCalledWith({
      chatId: 12345,
      creatorId: 123,
      title: "Trip",
      expenseIds: ["a", "b"],
    });
  });
});
