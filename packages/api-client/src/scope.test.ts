import { describe, it, expect, vi } from "vitest";
import { resolveChatId } from "./scope.js";
import type { TrpcClient } from "./client.js";

describe("resolveChatId", () => {
  it("returns explicit chatId when provided", async () => {
    const trpc = {} as TrpcClient;
    await expect(resolveChatId(trpc, "42")).resolves.toBe(42);
    await expect(resolveChatId(trpc, 99)).resolves.toBe(99);
  });

  it("uses apiKey scope when chatId omitted", async () => {
    const query = vi.fn().mockResolvedValue({ scoped: true, chatId: "99" });
    const trpc = { apiKey: { getScope: { query } } } as unknown as TrpcClient;
    await expect(resolveChatId(trpc)).resolves.toBe(99);
    expect(query).toHaveBeenCalled();
  });

  it("throws when chatId required but missing", async () => {
    const query = vi.fn().mockResolvedValue({ scoped: false });
    const trpc = { apiKey: { getScope: { query } } } as unknown as TrpcClient;
    await expect(resolveChatId(trpc)).rejects.toThrow(/required/i);
  });
});
