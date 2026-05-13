import { describe, expect, it } from "vitest";
import {
  buildCounterpartyDeepLinkPayload,
  buildMiniAppUrl,
  numericIdToUuid,
  uuidToNumericId,
} from "./counterpartyDeepLink.js";
import { decodeV1DeepLink } from "./deepLinkProtocol.js";

describe("numericIdToUuid + uuidToNumericId", () => {
  it("round-trips a small id", () => {
    const id = BigInt(259941064);
    expect(uuidToNumericId(numericIdToUuid(id))).toBe(id);
  });

  it("round-trips a larger bigint", () => {
    const id = BigInt("1234567890123456789");
    expect(uuidToNumericId(numericIdToUuid(id))).toBe(id);
  });

  it("produces a UUID-shaped string", () => {
    const uuid = numericIdToUuid(123n);
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("rejects negative", () => {
    expect(() => numericIdToUuid(-1n)).toThrow();
  });
});

describe("buildCounterpartyDeepLinkPayload", () => {
  it("encodes recipient + counterparty so v1 decoder returns both", () => {
    const recipientId = 259941064n;
    const counterpartyId = 100200300n;
    const payload = buildCounterpartyDeepLinkPayload(
      recipientId,
      counterpartyId
    );
    expect(payload).toMatch(/^v1_p_/);

    const decoded = decodeV1DeepLink(payload)!;
    expect(decoded.chat_type).toBe("p");
    expect(decoded.chat_id).toBe(recipientId.toString());
    expect(decoded.entity_type).toBe("c");
    expect(uuidToNumericId(decoded.entity_id!)).toBe(counterpartyId);
  });
});

describe("buildMiniAppUrl", () => {
  it("builds a t.me startapp URL", () => {
    expect(buildMiniAppUrl("BananaSplitzBot", "v1_p_abc_c_xyz")).toBe(
      "https://t.me/BananaSplitzBot?startapp=v1_p_abc_c_xyz"
    );
  });
});
