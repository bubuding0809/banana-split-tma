import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { generateUserTokenHandler } from "./generateUserToken.js";

function makeDb() {
  let lastCreate: any;
  return {
    userApiKey: {
      create: async ({ data }: any) => {
        lastCreate = data;
        return { id: "uuid", ...data };
      },
    },
    _lastCreate: () => lastCreate,
  } as any;
}

describe("generateUserTokenHandler", () => {
  it("rejects empty name after trim", async () => {
    const db = makeDb();
    await expect(
      generateUserTokenHandler({ name: "   " }, db, 42)
    ).rejects.toThrow(TRPCError);
  });

  it("trims and persists name", async () => {
    const db = makeDb();
    await generateUserTokenHandler({ name: "  CLI  " }, db, 42);
    expect(db._lastCreate().name).toBe("CLI");
  });

  it("requires authentication", async () => {
    const db = makeDb();
    await expect(
      generateUserTokenHandler({ name: "CLI" }, db, undefined)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
