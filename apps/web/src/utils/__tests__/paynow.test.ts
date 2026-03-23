import { describe, it, expect } from "vitest";
import { generatePayNowString, isValidSgMobile } from "../paynow";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a top-level TLV field from an EMV QR string at the given offset. */
function parseTlv(data: string, offset: number) {
  const id = data.slice(offset, offset + 2);
  const length = parseInt(data.slice(offset + 2, offset + 4), 10);
  const value = data.slice(offset + 4, offset + 4 + length);
  return { id, length, value, next: offset + 4 + length };
}

/** Extract all top-level TLV fields from an EMV QR payload string. */
function parseAllTlv(data: string) {
  const fields = new Map<string, string>();
  let offset = 0;
  while (offset < data.length) {
    const { id, value, next } = parseTlv(data, offset);
    fields.set(id, value);
    offset = next;
  }
  return fields;
}

/** CRC16-CCITT reference implementation for test verification. */
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// ── isValidSgMobile ──────────────────────────────────────────────────────────

describe("isValidSgMobile", () => {
  it.each([
    ["6591234567", "without +"],
    ["+6591234567", "with +"],
    ["6581234567", "starting with 8"],
    ["+6581234567", "starting with 8 with +"],
    ["65 9123 4567", "with spaces"],
  ])("returns true for valid SG mobile: %s (%s)", (phone) => {
    expect(isValidSgMobile(phone)).toBe(true);
  });

  it.each([
    ["6571234567", "starts with 7"],
    ["6512345678", "starts with 1"],
    ["659123456", "too short"],
    ["65912345678", "too long"],
    ["1234567890", "non-SG country code"],
    ["", "empty string"],
  ])("returns false for invalid SG mobile: %s (%s)", (phone) => {
    expect(isValidSgMobile(phone)).toBe(false);
  });
});

// ── generatePayNowString ─────────────────────────────────────────────────────

describe("generatePayNowString", () => {
  const PHONE = "6591234567";
  const AMOUNT = 12.5;
  const NAME = "Alice";

  it("produces a string starting with Payload Format Indicator 0002 01", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    expect(qr.startsWith("000201")).toBe(true);
  });

  it("sets Point of Initiation to 12", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("01")).toBe("12");
  });

  it("sets Point of Initiation to 12 even when amount is 0", () => {
    const qr = generatePayNowString(PHONE, 0, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("01")).toBe("12");
  });

  describe("Merchant Account Info (tag 26)", () => {
    it("contains SG.PAYNOW GUID", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const mai = fields.get("26")!;
      const subFields = parseAllTlv(mai);
      expect(subFields.get("00")).toBe("SG.PAYNOW");
    });

    it("sets proxy type to 0 (mobile number)", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("01")).toBe("0");
    });

    it("formats phone number as E.164 with + prefix", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("02")).toBe("+6591234567");
    });

    it("does not double-add + if phone already has it", () => {
      const qr = generatePayNowString("+6591234567", AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("02")).toBe("+6591234567");
    });

    it("sets amount editable flag to 1 (payer can edit)", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("03")).toBe("1");
    });

    it("includes expiry date sub-tag 04 in YYYYMMDD format", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      const expiryValue = subFields.get("04")!;
      expect(expiryValue).toMatch(/^\d{8}$/); // YYYYMMDD
      // Should be ~5 years in the future
      const expiryYear = parseInt(expiryValue.slice(0, 4), 10);
      const currentYear = new Date().getFullYear();
      expect(expiryYear).toBe(currentYear + 5);
    });
  });

  it("includes Transaction Amount tag (54) when amount > 0", () => {
    const qr = generatePayNowString(PHONE, 12.5, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("54")).toBe("12.5");
  });

  it("omits Transaction Amount tag (54) when amount is 0", () => {
    const qr = generatePayNowString(PHONE, 0, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.has("54")).toBe(false);
  });

  it("sets Transaction Currency to 702 (SGD)", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("53")).toBe("702");
  });

  it("sets Country Code to SG", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("58")).toBe("SG");
  });

  it("sets Merchant City to SINGAPORE", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("60")).toBe("Singapore");
  });

  it("truncates merchant name to 25 characters", () => {
    const longName = "A".repeat(30);
    const qr = generatePayNowString(PHONE, AMOUNT, longName);
    const fields = parseAllTlv(qr);
    expect(fields.get("59")).toBe("A".repeat(25));
  });

  it("includes bill reference in Additional Data (tag 62) when provided", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME, "INV-001");
    const fields = parseAllTlv(qr);
    const additionalData = fields.get("62")!;
    const subFields = parseAllTlv(additionalData);
    expect(subFields.get("01")).toBe("INV-001");
  });

  it("omits Additional Data (tag 62) when no reference provided", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.has("62")).toBe(false);
  });

  it("ends with a valid CRC16-CCITT checksum", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    // Last 4 chars are the CRC, computed over everything before them
    const payload = qr.slice(0, -4);
    const expectedCrc = crc16(payload);
    expect(qr.slice(-4)).toBe(expectedCrc);
  });

  it("has correct TLV lengths throughout (total string is self-consistent)", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME, "REF-123");
    // Walk through the entire string verifying every TLV field is well-formed.
    // The trailing CRC "6304" + 4 hex digits is a proper TLV: tag=63, len=04, value=XXXX
    let offset = 0;
    while (offset < qr.length) {
      const { next } = parseTlv(qr, offset);
      expect(next).toBeGreaterThan(offset);
      offset = next;
    }
    // We should have consumed every character
    expect(offset).toBe(qr.length);
  });
});
