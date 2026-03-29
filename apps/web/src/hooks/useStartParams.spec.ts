import { describe, it, expect, vi } from "vitest";
import { parseRawParams } from "./useStartParams";

// We need to mock the v1 decoder so we don't depend on trpc utils directly here
vi.mock("@dko/trpc/src/utils/deepLinkProtocol", () => ({
  decodeV1DeepLink: vi.fn((raw) => {
    if (raw === "v1_g_1E2R4w_s_7N42dgm5tFLK9N8MT7fXbc") {
      return {
        chat_id: "-1001234567890",
        chat_type: "g",
        entity_type: "s",
        entity_id: "123e4567-e89b-12d3-a456-426614174000",
      };
    }
    // Simulate bounds check failure for big ints
    if (raw === "v1_g_TOO_BIG") {
      return {
        chat_id: "9007199254740992", // Number.MAX_SAFE_INTEGER + 1
        chat_type: "g",
        entity_type: "s",
        entity_id: "123e4567-e89b-12d3-a456-426614174000",
      };
    }
    return null;
  }),
}));

describe("Frontend Deep Link Parser", () => {
  it("should successfully parse legacy base64 JSON payloads", () => {
    // {"chat_id":-1001234567890,"chat_type":"g"} in base64
    const legacyBase64 =
      "eyJjaGF0X2lkIjotMTAwMTIzNDU2Nzg5MCwiY2hhdF90eXBlIjoiZyJ9";
    const result = parseRawParams(legacyBase64);
    expect(result).toEqual({ chat_id: -1001234567890, chat_type: "g" });
  });

  it("should successfully parse v1 deep link payloads", () => {
    const v1Payload = "v1_g_1E2R4w_s_7N42dgm5tFLK9N8MT7fXbc";
    const result = parseRawParams(v1Payload);
    expect(result).toEqual({
      chat_id: -1001234567890,
      chat_type: "g",
      entity_type: "s",
      entity_id: "123e4567-e89b-12d3-a456-426614174000",
    });
  });

  it("should fall back gracefully if bounds checking fails", () => {
    const v1PayloadTooBig = "v1_g_TOO_BIG";
    const result = parseRawParams(v1PayloadTooBig);
    // Entity types and chat id should be deleted since it failed the bounds check
    expect(result).toEqual({ chat_type: "g" });
  });
});
