import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { renameUserTokenHandler } from "./renameUserToken.js";

function makeDb(opts: { tokenExists?: boolean }) {
  const update = vi.fn(async ({ data }: any) => ({
    id: "t1",
    name: data.name,
  }));
  return {
    userApiKey: {
      findFirst: async () => ((opts.tokenExists ?? true) ? { id: "t1" } : null),
      update,
    },
    _update: update,
  } as any;
}

describe("renameUserTokenHandler", () => {
  it("rejects empty name", async () => {
    const db = makeDb({});
    await expect(
      renameUserTokenHandler(
        { tokenId: "00000000-0000-0000-0000-000000000001", name: " " },
        db,
        42
      )
    ).rejects.toThrow(TRPCError);
  });

  it("404s on missing token", async () => {
    const db = makeDb({ tokenExists: false });
    await expect(
      renameUserTokenHandler(
        { tokenId: "00000000-0000-0000-0000-000000000001", name: "Mac" },
        db,
        42
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("trims and saves on success", async () => {
    const db = makeDb({});
    await renameUserTokenHandler(
      { tokenId: "00000000-0000-0000-0000-000000000001", name: "  My CLI  " },
      db,
      42
    );
    expect(db._update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { name: "My CLI" },
      select: { id: true, name: true },
    });
  });
});
