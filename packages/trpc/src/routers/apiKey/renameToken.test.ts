import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { renameTokenHandler } from "./renameToken.js";

function makeDb(opts: { isMember?: boolean; tokenExists?: boolean }) {
  const update = vi.fn(async ({ data }: any) => ({
    id: "t1",
    name: data.name,
  }));
  return {
    chat: {
      findFirst: async () => ((opts.isMember ?? true) ? { id: 1n } : null),
    },
    chatApiKey: {
      findFirst: async () => ((opts.tokenExists ?? true) ? { id: "t1" } : null),
      update,
    },
    _update: update,
  } as any;
}

describe("renameTokenHandler", () => {
  it("rejects empty name", async () => {
    const db = makeDb({});
    await expect(
      renameTokenHandler(
        {
          chatId: 1n,
          tokenId: "00000000-0000-0000-0000-000000000001",
          name: "  ",
        },
        db,
        42
      )
    ).rejects.toThrow(TRPCError);
  });

  it("rejects non-members", async () => {
    const db = makeDb({ isMember: false });
    await expect(
      renameTokenHandler(
        {
          chatId: 1n,
          tokenId: "00000000-0000-0000-0000-000000000001",
          name: "Mac",
        },
        db,
        42
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("404s on missing token", async () => {
    const db = makeDb({ tokenExists: false });
    await expect(
      renameTokenHandler(
        {
          chatId: 1n,
          tokenId: "00000000-0000-0000-0000-000000000001",
          name: "Mac",
        },
        db,
        42
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("trims and saves on success", async () => {
    const db = makeDb({});
    await renameTokenHandler(
      {
        chatId: 1n,
        tokenId: "00000000-0000-0000-0000-000000000001",
        name: "  Mac CLI  ",
      },
      db,
      42
    );
    expect(db._update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Mac CLI" } })
    );
  });
});
