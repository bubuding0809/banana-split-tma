import { describe, it, expect, vi } from "vitest";
import { listCategories } from "./category.js";

vi.mock("@bananasplitz/api-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@bananasplitz/api-client")>();
  return {
    ...actual,
    resolveChatId: vi.fn(async () => 42),
  };
});

describe("category ops", () => {
  it("listCategories calls trpc.category.listByChat", async () => {
    const queryMock = vi.fn().mockResolvedValue({ items: [] });
    const trpc = { category: { listByChat: { query: queryMock } } } as never;

    await listCategories(trpc, {});

    expect(queryMock).toHaveBeenCalledWith({ chatId: 42 });
  });
});
