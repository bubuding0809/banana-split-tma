import { describe, expect, it, vi } from "vitest";
import type { BananaTrpcClient } from "../src/lib/trpc";
import { resolveChatId } from "../src/lib/tools/scope";

function createTrpcWithScope(scope: { scoped: boolean; chatId?: bigint | number | string | null }) {
  const query = vi.fn(async () => scope);
  const trpc = {
    apiKey: {
      getScope: {
        query,
      },
    },
  } as unknown as BananaTrpcClient;

  return { trpc, query };
}

describe("resolveChatId", () => {
  it("uses an explicit chat ID without checking key scope", async () => {
    const { trpc, query } = createTrpcWithScope({ scoped: false });

    await expect(resolveChatId(trpc, "12345")).resolves.toBe(12345);
    expect(query).not.toHaveBeenCalled();
  });

  it("uses the chat-scoped fallback when no explicit ID is provided", async () => {
    const { trpc, query } = createTrpcWithScope({ scoped: true, chatId: 67890n });

    await expect(resolveChatId(trpc)).resolves.toBe(67890);
    expect(query).toHaveBeenCalledOnce();
  });

  it("errors when chatId is missing for a non-scoped API key", async () => {
    const { trpc } = createTrpcWithScope({ scoped: false });

    await expect(resolveChatId(trpc)).rejects.toThrow("chatId is required");
  });

  it("errors when an explicit chatId is not numeric", async () => {
    const { trpc, query } = createTrpcWithScope({ scoped: true, chatId: 67890n });

    await expect(resolveChatId(trpc, "not-a-number")).rejects.toThrow("chatId must be a number");
    expect(query).not.toHaveBeenCalled();
  });
});
