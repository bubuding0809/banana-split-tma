import { describe, expect, it } from "vitest";
import { listMembersHandler } from "./listMembers.js";

function makeDb(members: any[]) {
  return {
    chat: {
      findUnique: async () => ({ members }),
    },
  } as any;
}

describe("listMembersHandler", () => {
  it("returns id / firstName / lastName / username only", async () => {
    const db = makeDb([
      {
        id: 100n,
        firstName: "Ruoqian",
        lastName: "Ding",
        username: "bubuding",
      },
    ]);
    const result = await listMembersHandler({ chatId: 1 }, db);
    expect(result).toEqual([
      {
        id: "100",
        firstName: "Ruoqian",
        lastName: "Ding",
        username: "bubuding",
      },
    ]);
  });

  it("returns [] when chat is missing", async () => {
    const db = {
      chat: { findUnique: async () => null },
    } as any;
    const result = await listMembersHandler({ chatId: 999 }, db);
    expect(result).toEqual([]);
  });
});
