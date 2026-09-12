import { describe, it, expect } from "vitest";
import { withCreateTRPCContext } from "./trpc.js";
import { startFakeTelegramServer } from "./testing/fakeTelegramServer.js";

describe("TELEGRAM_API_ROOT", () => {
  it("routes Bot API calls through the configured root", async () => {
    const server = await startFakeTelegramServer();
    try {
      const createContext = withCreateTRPCContext({
        TELEGRAM_BOT_TOKEN: "123:TEST",
        TELEGRAM_API_ROOT: server.url,
      });
      const ctx = createContext({
        req: { headers: {} },
        res: {},
        info: {},
      } as never);
      const me = await ctx.teleBot.getMe();
      expect(me.username).toBe("testbot");
      expect(server.calls.map((c) => c.method)).toEqual(["getMe"]);
    } finally {
      await server.close();
    }
  });
});
