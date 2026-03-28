import { describe, it, expect } from "vitest";
import { encodeV1DeepLink, decodeV1DeepLink } from "./deepLinkProtocol.js";

describe("Deep Link Protocol v1", () => {
  it("should accurately encode and decode snapshot deep link payloads", () => {
    const chatId = -1001234567890n;
    const chatType = "g";
    const entityType = "s";
    const entityId = "123e4567-e89b-12d3-a456-426614174000";

    const encoded = encodeV1DeepLink(chatId, chatType, entityType, entityId);

    // Check format
    expect(encoded).toMatch(/^v1_g_-?[a-zA-Z0-9]+_s_[a-zA-Z0-9]+$/);

    // Ensure it's under 64 characters
    expect(encoded.length).toBeLessThan(64);

    const decoded = decodeV1DeepLink(encoded);
    expect(decoded).toEqual({
      chat_id: "-1001234567890", // Returning as string to preserve BigInt precision on frontend
      chat_type: "g",
      entity_type: "s",
      entity_id: "123e4567-e89b-12d3-a456-426614174000",
    });
  });

  it("should handle padding for UUIDs with leading zeros", () => {
    const uuidWithLeadingZeros = "00004567-e89b-12d3-a456-426614174000";
    const encoded = encodeV1DeepLink(-1n, "p", "s", uuidWithLeadingZeros);
    const decoded = decodeV1DeepLink(encoded);
    expect(decoded?.entity_id).toBe(uuidWithLeadingZeros);
    expect(decoded?.chat_id).toBe("-1");
  });

  it("should return null for invalid v1 strings", () => {
    expect(decodeV1DeepLink("v1_g_invalid_format")).toBeNull();
  });
});
