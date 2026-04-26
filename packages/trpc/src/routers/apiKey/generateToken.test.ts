import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { generateTokenHandler } from "./generateToken.js";

// Minimal in-memory db stub — only the methods this handler calls.
function makeDb(opts: { isMember: boolean }) {
  let lastCreate: any;
  return {
    chat: {
      findFirst: async () => (opts.isMember ? { id: 1n } : null),
    },
    chatApiKey: {
      create: async ({ data }: any) => {
        lastCreate = data;
        return { id: "uuid", ...data };
      },
    },
    _lastCreate: () => lastCreate,
  } as any;
}

describe("generateTokenHandler", () => {
  it("rejects empty name after trim", async () => {
    const db = makeDb({ isMember: true });
    await expect(
      generateTokenHandler({ chatId: 1n, name: "   " }, db, 42)
    ).rejects.toThrow(TRPCError);
  });

  it("trims and persists name on the row", async () => {
    const db = makeDb({ isMember: true });
    await generateTokenHandler({ chatId: 1n, name: "  CLI Mac  " }, db, 42);
    expect(db._lastCreate().name).toBe("CLI Mac");
  });

  it("rejects non-members with FORBIDDEN", async () => {
    const db = makeDb({ isMember: false });
    await expect(
      generateTokenHandler({ chatId: 1n, name: "CLI" }, db, 42)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
