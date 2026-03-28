import { describe, it, expect } from "vitest";
import { ChatUtils } from "./chat.js";

describe("Bot Chat Utils", () => {
  it("should generate a v1 deep link for the chat context", () => {
    // Generate a group chat context
    const payload = ChatUtils.createChatContext(-1001234567890n, "group");

    // Should start with v1_g_ and a Base62 encoded chat ID (potentially negative)
    expect(payload).toMatch(/^v1_g_-?[a-zA-Z0-9]+$/);
  });

  it("should generate a v1 deep link for private chat context", () => {
    // Generate a private chat context
    const payload = ChatUtils.createChatContext(123456789n, "private");

    // Should start with v1_p_
    expect(payload).toMatch(/^v1_p_[a-zA-Z0-9]+$/);
  });
});
